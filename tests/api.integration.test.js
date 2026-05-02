require('dotenv').config();
const apiService = require('../services/api.service');

describe('Pruebas de Integración con APIs Reales (CelerPass)', () => {
    // Aumentamos el timeout por si el servidor real demora en responder
    jest.setTimeout(15000);

    let validClientId = null;
    let validDocId = null;

    test('Endpoint 1: validatePhoneNumber - Debe responder correctamente', async () => {
        try {
            // Pasamos un número ficticio para ver cómo responde el servidor real
            const result = await apiService.validatePhoneNumber('5491100000000');
            // Validamos que el servidor devuelve la propiedad isClient
            expect(result).toHaveProperty('isClient');
        } catch (error) {
            // Si el servidor falla, la prueba fallará
            throw new Error(`La API falló al responder: ${error.message}`);
        }
    });

    test('Endpoint 2: pending-clients - Debe responder con datos y obtener un cliente real', async () => {
        try {
            const result = await apiService.getPendingClients();
            expect(result).toBeDefined();

            // Buscamos dinámicamente un clientId real en la respuesta para pasarlo a los próximos tests
            if (Array.isArray(result) && result.length > 0 && result[0].list && result[0].list.length > 0) {
                validClientId = result[0].list[0].clientId;
            } else if (result.list && result.list.length > 0) {
                validClientId = result.list[0].clientId;
            }
        } catch (error) {
            throw new Error(`La API falló al responder: ${error.message}`);
        }
    });

    test('Endpoint 3: pending-documents - Debe responder usando un clientId válido', async () => {
        const idToTest = validClientId || 'test-client-id';
        try {
            const result = await apiService.getPendingDocuments(idToTest);
            expect(result).toBeDefined();

            // Si el cliente tiene documentos, guardamos un idDocument real para probar la carga
            if (result.documentList && result.documentList.length > 0) {
                validDocId = result.documentList[0].idDocument;
            }
        } catch (error) {
            if (!error.message.includes('400') && !error.message.includes('404')) {
                throw new Error(`Error inesperado del servidor: ${error.message}`);
            }
        }
    });

    test('Endpoint 4: validate-document - Debe evaluar un archivo Base64 enviado (Esperando 200 OK)', async () => {
        const idClientTest = validClientId || 'test-client-id';
        const idDocTest = validDocId || 'test-doc-id';
        const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        
        const result = await apiService.validateDocument(idDocTest, idClientTest, dummyBase64);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('documentValid');
    });

    test('Endpoint 5: getClientQR - Debe responder ante la solicitud con el clientId (Esperando 200 OK)', async () => {
        const idToTest = validClientId || 'test-client-id';
        const result = await apiService.getClientQR(idToTest);
        expect(result).toBeDefined();
        // Validamos explícitamente que la respuesta contenga la imagen del QR en base64
        expect(result).toHaveProperty('base64');
        expect(typeof result.base64).toBe('string');
        expect(result.base64.length).toBeGreaterThan(10);
    });
});
