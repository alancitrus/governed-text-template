import { oak, oakHelpers as oakH } from "./deps.ts";
import * as tm from "./template-module.ts";

export function executeTemplateModuleOptions(
  ctx: oak.RouterContext,
): tm.ExecuteTemplateModuleOptions {
  return {
    onContentGuardFailure: () => {
      ctx.response.status = 400;
      return undefined; // use the default message
    },
    onTemplateIdGuardFailure: () => {
      ctx.response.status = 410;
      return undefined; // use the default message
    },
  };
}

export function httpServiceRouter(
  options?: tm.TransformJsonInputOptions & {
    templateModules?: () => Record<string, string> | undefined;
  },
): oak.Router {
  const templateModules = options?.templateModules
    ? options?.templateModules()
    : undefined;
  const router = new oak.Router();
  router
    .get("/", (ctx) => {
      ctx.response.body = "Template Orchestration Controller";
    })
    .get("/transform/:module/:templateId?", async (ctx) => {
      if (templateModules) {
        if (ctx.params && ctx.params.module) {
          const templateURL = templateModules[ctx.params.module];
          if (templateURL) {
            const content: Record<string, unknown> = {};
            ctx.request.url.searchParams.forEach((v, k) => content[k] = v);
            ctx.response.body = await tm.executeTemplateModule({
              srcURL: templateURL,
              content: content,
              templateIdentity: ctx.params.templateId,
            }, executeTemplateModuleOptions(ctx));
          } else {
            ctx.response.status = 400;
            ctx.response.body = {
              code: 1,
              message:
                `Template module '${ctx.params.module}' not found. Available: ${
                  Object.keys(templateModules).join(",")
                }'`,
            };
          }
        }
      } else {
        ctx.response.status = 501;
        ctx.response.body = {
          code: 0,
          message: "No pre-defined template modules supplied.",
        };
      }
    })
    .post("/transform", async (ctx) => {
      const result = ctx.request.body({ type: "text" });
      ctx.response.body = await tm.transformJsonInput(await result.value, {
        allowArbitraryModule: options?.allowArbitraryModule || undefined,
        defaultTemplateModuleURL: options?.defaultTemplateModuleURL ||
          undefined,
        defaultTemplateIdentity: options?.defaultTemplateIdentity || undefined,
        onArbitraryModuleNotAllowed: (templateUrl) => {
          const message = options?.onArbitraryModuleNotAllowed
            ? options?.onArbitraryModuleNotAllowed(templateUrl)
            : `arbitrary module ${templateUrl} not allowed.`;
          ctx.response.status = 403;
          ctx.response.body = {
            code: 2,
            message: message,
          };
          return message;
        },
        onInvalidJSON: () => {
          ctx.response.status = 400;
          return undefined; // use the default message
        },
        namedTemplateModuleURL: options?.namedTemplateModuleURL ||
          ((name: string): string | undefined => {
            return templateModules ? templateModules[name] : undefined;
          }),
        ...executeTemplateModuleOptions(ctx),
      });
    });
  return router;
}

export function httpServer(
  options: {
    router: oak.Router;
    port: number;
    mwOptions?: oakH.TypicalMiddlewareOptions;
  },
): oak.Application {
  const app = new oak.Application();
  app.addEventListener("listen", (event) => {
    console.log(
      `Template Orchestration service listening on http://${event.hostname ||
        "localhost"}:${event.port}`,
    );
  });
  oakH.registerTypicalMiddleware(
    app,
    options.mwOptions || { accessReporter: oakH.defaultAccessReporter },
  );
  app.use(options.router.routes());
  app.use(options.router.allowedMethods());
  return app;
}
