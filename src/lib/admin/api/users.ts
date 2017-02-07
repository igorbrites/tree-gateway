"use strict";

import {Path, GET, POST, DELETE, PUT, PathParam, FileParam, FormParam, Errors, Return,
        Accept, QueryParam, ContextRequest} from "typescript-rest";
import "es6-promise";
import {UserData, validateUser} from "../../config/users";
import {UserService} from "../../service/users";
import * as _ from "lodash";
import * as express from "express";
import {AutoWired, Container, Inject} from "typescript-ioc";

@Path('users')
@AutoWired
export class UsersRest {
    @Inject private service: UserService;

    @GET
    listUsers(): Promise<Array<UserData>>{
        return this.service.list();
    }

    @POST
    createUser(user: UserData): Promise<Return.NewResource>{
        return new Promise<Return.NewResource>((resolve, reject) => {
            validateUser(user).then((validUser: UserData) =>
                this.service.create(validUser)
            )
            .then(() => {
                resolve(new Return.NewResource(`/users/${user.login}`));
            })
            .catch(reject);
        });
    }

    @GET
    @Path(":userLogin")
    getUser(@PathParam("userLogin") login: string): Promise<UserData>{
        return new Promise<UserData>((resolve, reject) => {
            this.service.get(login)
            .then(user => {
                if (user) {
                    return resolve(<UserData>_.omit(user, "password"));
                }
                return reject(new Errors.NotFoundError());
            }).catch(reject);
        });
    }

    @PUT
    @Path(":userLogin")
    updateUser(user: UserData): Promise<void>{
        return new Promise<void>((resolve, reject) => {
            validateUser(user)
                .then((validUser: UserData) => this.service.update(validUser))
                .then(() => resolve())
                .catch(reject);
        });
    }

    @DELETE
    @Path(":userLogin")
    removeUser(@PathParam('userLogin')login: string): Promise<void>{
        return this.service.remove(login);
    }

    @POST
    @Path("/authentication")
    getAuthToken(@FormParam("login") login: string, @FormParam("password") password: string): Promise<string>{
        return new Promise<string>((resolve, reject)=>{
            this.service.generateToken(login, password)
            .then(resolve)
            .catch(err => {
                reject(new Errors.UnauthorizedError(err));
            });
        });
    }

    @POST
    @Path("/authentication/changepassword")
    changePasswordToken(@ContextRequest req: express.Request, 
                        @FormParam("login") login: string, 
                        @FormParam("password") password: string): Promise<void>{
        if ((req.user.login !== login) || 
            (!req.user.roles || 
            (req.user.roles.indexOf('tree-gateway-admin') < 0))) {
            throw new Errors.ForbidenError('Access denied');
        }

        return this.service.changePassword(login, password);
    }

    static configureAuthMiddleware(app: express.Router) {
        let authenticator = Container.get(UserService).getAuthMiddleware();
        let manageUsers = (req, res, next) => {
            if (!req.user.roles || (req.user.roles.indexOf('tree-gateway-admin') < 0)) {
                return next(new Errors.ForbidenError('Access denied'));
            }
            next();
        };
        let adminGateway = (req, res, next) => {
            if (req.path === '/users/authentication') {
                return next();
            }

            if (!req.user.roles || (req.user.roles.indexOf('tree-gateway-config') < 0)) {
                return next(new Errors.ForbidenError('Access denied'));
            }
            next();
        };
        app.use((req, res, next) => {
            if (req.path === '/users/authentication') {
                return next();
            }
            authenticator(req, res, next);
        });
        app.get('/users', manageUsers);
        app.post('/users', manageUsers);
        app.get('/users/:userLogin', manageUsers);
        app.put('/users/:userLogin', manageUsers);
        app.delete('/users/:userLogin', manageUsers);
        app.use(adminGateway);
    }    
}
