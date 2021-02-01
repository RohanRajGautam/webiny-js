import md5 from "md5";
import { hasPermission } from "@webiny/api-security";
import {
    CreateUserInput,
    TenancyContext,
    SecurityIdentityProviderPlugin,
    UpdateUserInput,
    User
} from "../types";
import { SecurityContext } from "@webiny/api-security/types";
import {
    Response,
    NotFoundResponse,
    ErrorResponse,
    ListResponse,
    ListErrorResponse
} from "@webiny/handler-graphql/responses";
import { Context as HandlerContext } from "@webiny/handler/types";
import { GraphQLSchemaPlugin } from "@webiny/handler-graphql/types";

const gravatar = (user: User) => {
    return "https://www.gravatar.com/avatar/" + md5(user.login);
};

type Context = HandlerContext<TenancyContext, SecurityContext>;

const plugin: GraphQLSchemaPlugin = {
    type: "graphql-schema",
    name: "graphql-schema-security-user",
    schema: {
        typeDefs: `
            type TenantAccess {
                """
                Tenant ID
                """
                id: ID

                """
                Tenant name
                """
                name: String

                """
                Tenant permissions
                """
                permissions: [JSON]
            }

            type SecurityIdentity {
                login: String
                access: [TenantAccess]
                firstName: String
                lastName: String
                avatar: JSON
                gravatar: String
            }

            type SecurityUserGroup {
                name: String
                slug: String
            }

            type SecurityUser {
                login: String
                firstName: String
                lastName: String
                avatar: JSON
                gravatar: String
                createdOn: DateTime
                """
                The group this user belongs to within current tenant.
                """
                group: SecurityUserGroup
            }

            """
            This input type is used by administrators to create other user's accounts within the same tenant.
            """
            input SecurityUserCreateInput {
                login: String!
                firstName: String!
                lastName: String!
                avatar: JSON
                group: String!
            }
            
            """
            This input type is used by administrators to update other user's accounts within the same tenant.
            """
            input SecurityUserUpdateInput {
                firstName: String
                lastName: String
                avatar: JSON
                group: String
            }

            """
            This input type is used by the user who is updating his own account
            """
            input SecurityCurrentUserInput {
                firstName: String
                lastName: String
                avatar: JSON
            }

            type SecurityUserResponse {
                data: SecurityUser
                error: SecurityError
            }
            
            type SecurityUserListResponse {
                data: [SecurityUser]
                error: SecurityError
            }

            type SecurityIdentityLoginResponse {
                data: SecurityIdentity
                error: SecurityError
            }

            extend type SecurityQuery {
                "Get a single user by id or specific search criteria"
                getUser(login: String): SecurityUserResponse
                
                "Get current user"
                getCurrentUser: SecurityUserResponse

                "Get a list of users"
                listUsers: SecurityUserListResponse
            }

            extend type SecurityMutation {
                "Login using idToken obtained from a 3rd party identity provider"
                login: SecurityIdentityLoginResponse

                "Update current user"
                updateCurrentUser(data: SecurityCurrentUserInput!): SecurityUserResponse

                createUser(data: SecurityUserCreateInput!): SecurityUserResponse

                updateUser(login: String!, data: SecurityUserUpdateInput!): SecurityUserResponse

                deleteUser(login: String!): SecurityBooleanResponse
            }
        `,
        resolvers: {
            SecurityUser: {
                gravatar,
                async avatar(user: User) {
                    return user.avatar;
                },
                async group(user: User, args, context: Context) {
                    const tenant = context.security.getTenant();
                    const allPermissions = await context.security.users.getUserAccess(user.login);
                    const tenantAccess = allPermissions.find(p => p.tenant.id === tenant.id);
                    if (tenantAccess) {
                        return { slug: tenantAccess.group.slug, name: tenantAccess.group.name };
                    }

                    return null;
                }
            },
            SecurityIdentity: {
                gravatar,
                login: (_, args, context: Context) => {
                    return context.security.getIdentity().id;
                },
                async avatar(user: User) {
                    return user.avatar;
                },
                async access(user: User, args, context: Context) {
                    const access = await context.security.users.getUserAccess(user.login);
                    return access.map(item => ({
                        id: item.tenant.id,
                        name: item.tenant.name,
                        permissions: item.group.permissions
                    }));
                }
            },
            SecurityQuery: {
                getUser: hasPermission("security.user")(
                    async (_, args: { login: string }, context: Context) => {
                        const { login } = args;

                        try {
                            const user = await context.security.users.getUser(login);
                            if (!user) {
                                return new NotFoundResponse(`User "${login}" was not found!`);
                            }
                            return new Response(user);
                        } catch (e) {
                            return new ErrorResponse(e);
                        }
                    }
                ),
                getCurrentUser: async (_, args, context: Context) => {
                    const identity = context.security.getIdentity();

                    if (!identity) {
                        throw new Error("Not authorized!");
                    }

                    const user = await context.security.users.getUser(identity.id);
                    if (!user) {
                        return new NotFoundResponse(`User with ID ${identity.id} was not found!`);
                    }

                    return new Response(user);
                },
                listUsers: hasPermission("security.user")(async (_, args, context: Context) => {
                    try {
                        const tenant = context.security.getTenant();
                        const userList = await context.security.users.listUsers({
                            tenant: tenant.id
                        });

                        return new ListResponse(userList);
                    } catch (e) {
                        return new ListErrorResponse(e);
                    }
                })
            },
            SecurityMutation: {
                login: async (root, args, context: Context) => {
                    try {
                        const identity = context.security.getIdentity();

                        if (!identity) {
                            throw new Error("Not authorized!");
                        }

                        let user = await context.security.users.getUser(identity.id);

                        let firstLogin = false;

                        if (!user) {
                            firstLogin = true;
                            // Create a "Security User"
                            user = await context.security.users.createUser({
                                login: identity.id,
                                firstName: identity.firstName || "",
                                lastName: identity.lastName || "",
                                avatar: identity.avatar
                            });
                        }

                        const authPlugin = context.plugins.byName<SecurityIdentityProviderPlugin>(
                            "security-identity-provider"
                        );

                        if (typeof authPlugin.onLogin === "function") {
                            await authPlugin.onLogin({ user, firstLogin }, context);
                        }

                        return new Response(user);
                    } catch (e) {
                        return new ErrorResponse(e);
                    }
                },
                updateCurrentUser: async (_, args: { data: UpdateUserInput }, context: Context) => {
                    const identity = context.security.getIdentity();
                    if (!identity) {
                        throw new Error("Not authorized!");
                    }

                    const user = await context.security.users.getUser(identity.id);
                    if (!user) {
                        return new NotFoundResponse("User not found!");
                    }

                    try {
                        // We need to explicitly pick attributes we want to handle, as plugins can add their own
                        // fields to GraphQL Schema, and we don't want to have those in the mix.
                        const { firstName, lastName, avatar } = args.data;

                        const updatedAttributes = await context.security.users.updateUser(
                            user.login,
                            {
                                firstName,
                                lastName,
                                avatar
                            }
                        );

                        // Assign updated attributes to the original user data object
                        Object.assign(user, updatedAttributes);

                        const authPlugin = context.plugins.byName<SecurityIdentityProviderPlugin>(
                            "security-identity-provider"
                        );

                        if (authPlugin) {
                            await authPlugin.updateUser({ data: args.data, user }, context);
                        }

                        return new Response(user);
                    } catch (e) {
                        return new ErrorResponse(e);
                    }
                },
                createUser: hasPermission("security.user")(
                    async (_, { data }: { data: CreateUserInput }, context: Context) => {
                        try {
                            const authPlugin = context.plugins.byName<
                                SecurityIdentityProviderPlugin
                            >("security-identity-provider");

                            // First let's try creating a user with our IDP
                            await authPlugin.createUser({ data }, context);

                            // Now we can store the user in our DB
                            const user = await context.security.users.createUser(data);

                            const tenant = context.security.getTenant();
                            const group = await context.security.groups.getGroup(
                                tenant,
                                data.group
                            );
                            await context.security.users.linkUserToTenant(
                                user.login,
                                tenant,
                                group
                            );

                            return new Response(user);
                        } catch (e) {
                            return new ErrorResponse(e);
                        }
                    }
                ),
                updateUser: hasPermission("security.user")(
                    async (
                        root,
                        { data, login }: { login: string; data: UpdateUserInput },
                        context: Context
                    ) => {
                        try {
                            const user = await context.security.users.getUser(login);

                            if (!user) {
                                return new NotFoundResponse(`User "${login}" was not found!`);
                            }

                            const updatedAttributes = await context.security.users.updateUser(
                                login,
                                data
                            );

                            // Link user with a new group
                            if (updatedAttributes.group) {
                                const tenant = context.security.getTenant();

                                await context.security.users.unlinkUserFromTenant(
                                    user.login,
                                    tenant
                                );

                                const group = await context.security.groups.getGroup(
                                    tenant,
                                    updatedAttributes.group
                                );

                                await context.security.users.linkUserToTenant(
                                    user.login,
                                    tenant,
                                    group
                                );
                            }

                            Object.assign(user, updatedAttributes);

                            const authPlugin = context.plugins.byName<
                                SecurityIdentityProviderPlugin
                            >("security-identity-provider");

                            if (authPlugin) {
                                await authPlugin.updateUser({ data, user }, context);
                            }

                            return new Response(user);
                        } catch (e) {
                            return new ErrorResponse(e);
                        }
                    }
                ),
                deleteUser: hasPermission("security.user")(
                    async (root, { login }: { login: string }, context: Context) => {
                        try {
                            const user = await context.security.users.getUser(login);

                            if (!user) {
                                return new NotFoundResponse(`User "${login}" was not found!`);
                            }

                            await context.security.users.deleteUser(login);

                            const authPlugin = context.plugins.byName<
                                SecurityIdentityProviderPlugin
                            >("security-identity-provider");

                            await authPlugin.deleteUser({ user }, context);

                            return new Response(true);
                        } catch (e) {
                            return new ErrorResponse(e);
                        }
                    }
                )
            }
        }
    }
};

export default plugin;
