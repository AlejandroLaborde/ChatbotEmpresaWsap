const apiService = require('../services/api.service');

// Hacer mock de fetch nativo para Jest (si se usa node-fetch, se mockea la librería)
jest.mock('node-fetch');
const fetch = require('node-fetch');

describe('API Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MESSAGING_API_KEY = "dummy-key";
    });

    test('validatePhoneNumber debe retornar la info del cliente', async () => {
        const mockResponse = { clientId: "mock-123", isClient: true, message: "OK" };
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
        });

        const result = await apiService.validatePhoneNumber('5491112345678');
        
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/validate-phone-number'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ number: '5491112345678' })
            })
        );
        expect(result).toEqual(mockResponse);
    });

    test('getPendingDocuments debe retornar la lista de documentos', async () => {
        const mockResponse = { documentList: [{ idDocument: 'doc-1', nameDocument: 'DNI' }] };
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
        });

        const result = await apiService.getPendingDocuments('mock-123');
        
        expect(result.documentList).toHaveLength(1);
        expect(result.documentList[0].nameDocument).toBe('DNI');
    });

    test('Debe lanzar un error si la API retorna status error', async () => {
        fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: async () => "Not Found"
        });

        await expect(apiService.getClientQR('mock-123')).rejects.toThrow(/get-QR falló: 404 Not Found/);
    });
});
