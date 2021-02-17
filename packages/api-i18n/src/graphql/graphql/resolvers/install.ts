import { ErrorResponse, Response } from "@webiny/handler-graphql/responses";

export const install = async (
    root: any,
    args: { [key: string]: any },
    context: { [key: string]: any }
) => {
    const { locales } = context;

    try {
        await locales.create({
            code: args.data.code,
            default: true,
            webinyVersion: context.WEBINY_VERSION
        });
        await locales.updateDefault(args.data.code);
    } catch (e) {
        return new ErrorResponse({
            code: e.code,
            message: e.message,
            data: e.data
        });
    }

    return new Response(true);
};

export const isInstalled = async (
    root: any,
    args: { [key: string]: any },
    context: { [key: string]: any }
) => {
    const { security } = context;
    if (!security.getTenant()) {
        return false;
    }

    const { locales } = context;
    const defaultLocale = await locales.getDefault();
    return new Response(Boolean(defaultLocale));
};
