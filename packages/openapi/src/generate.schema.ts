import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { AttachmentRoute } from './attachment';
import { RecordRoute } from './record';

function registerAllRoute() {
  const registry = new OpenAPIRegistry();
  const routeObjList: Record<string, RouteConfig>[] = [AttachmentRoute, RecordRoute];
  for (const routeObj of routeObjList) {
    for (const routeKey in routeObj) {
      const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
      registry.registerPath({ ...routeObj[routeKey], security: [{ [bearerAuth.name]: [] }] });
    }
  }
  return registry;
}

function getOpenApiDocumentation() {
  const registry = registerAllRoute();
  const generator = new OpenApiGeneratorV3(registry.definitions);

  const generated = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Teable App',
      description: `Manage Data as easy as drink a cup of tea`,
    },
    servers: [{ url: '/api/' }],
  });

  return generated;
}

export const openApiDocumentation = getOpenApiDocumentation();
