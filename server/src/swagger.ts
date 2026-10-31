export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'XYZ Retail Corporation Inventory Management API',
    version: '1.0.0',
    description: 'Enterprise REST API for Retail Inventory Management, Multi-Location Stock Tracking, Order Fulfillment, Supplier Management, and RFID/Barcode Scanners.'
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local Development Server' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key'
      }
    }
  },
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System health probe',
        responses: { '200': { description: 'Server and database healthy' } }
      }
    },
    '/api/auth/login': {
      post: {
        summary: 'Authenticate user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@xyzretail.com' },
                  password: { type: 'string', example: 'Admin123!' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'JWT tokens and user profile' } }
      }
    },
    '/api/products': {
      get: {
        summary: 'Get paginated product catalog with stock counts and filters',
        responses: { '200': { description: 'Product list' } }
      },
      post: {
        summary: 'Create a new product',
        responses: { '201': { description: 'Created product' } }
      }
    },
    '/api/inventory/stock': {
      get: {
        summary: 'Get real-time stock levels across locations',
        responses: { '200': { description: 'Current stock array' } }
      }
    },
    '/api/inventory/adjust': {
      post: {
        summary: 'Perform atomic manual stock adjustment with ledger recording',
        responses: { '200': { description: 'Updated stock and ledger entry' } }
      }
    },
    '/api/inventory/transfers': {
      post: {
        summary: 'Transfer inventory between warehouses or stores',
        responses: { '201': { description: 'Created transfer order' } }
      }
    },
    '/api/orders': {
      post: {
        summary: 'Create sales order with automatic stock reservation and backorder handling',
        responses: { '201': { description: 'Created sales order' } }
      }
    },
    '/api/suppliers/reorder-suggestions': {
      get: {
        summary: 'Get automated reorder suggestions for low stock products',
        responses: { '200': { description: 'List of recommended reorder quantities' } }
      }
    },
    '/api/barcode-rfid/lookup/{code}': {
      get: {
        summary: 'Lookup product and current stock by barcode or SKU',
        responses: { '200': { description: 'Product and inventory details' } }
      }
    },
    '/api/reports/dashboard': {
      get: {
        summary: 'Get executive dashboard KPIs, turnover, and top sellers',
        responses: { '200': { description: 'Dashboard metrics object' } }
      }
    }
  }
};
