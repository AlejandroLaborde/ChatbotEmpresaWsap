// Configuración inicial de entorno para TESTING
process.env.USE_MOCKS = 'false'; // Para que use el apiService mockeado por Jest
process.env.MOCK_MSG_SEND = 'true'; // Evita usar client.sendMessage
process.env.USE_DUMMY_NUMBER = 'false'; // Para usar los IDs del mock de API

const apiService = require('../services/api.service');
jest.mock('../services/api.service');

const { handleIncomingMessage, userStates } = require('../app');
const { addMsg } = require('jest-html-reporters/helper');

describe('Flujo conversacional del Chatbot', () => {
    let consoleLogSpy;

    beforeEach(() => {
        // Limpiamos los estados de memoria
        userStates.clear();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Mockeamos APIs para controlar el flujo
        apiService.validatePhoneNumber.mockResolvedValue({ isClient: true, clientId: "mock-123" });
        apiService.getPendingDocuments.mockResolvedValue({
            documentList: [
                { idDocument: 'doc-1', nameDocument: 'DNI', descripcionDocument: 'Frente' },
                { idDocument: 'doc-2', nameDocument: 'Factura', descripcionDocument: 'PDF' }
            ]
        });
        apiService.validateDocument.mockResolvedValue({ documentValid: true, message: "Documento válido." });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    const createMsg = (body, hasMedia = false) => ({
        from: '5491158232588@c.us',
        body,
        hasMedia,
        getContact: async () => ({ name: "Juan Tester" }),
        downloadMedia: async () => ({ data: "base64data" }),
        reply: async (text) => console.log(`[SIMULATED REPLY]: ${text}`)
    });

    test('Paso 1: Saludo inicial -> El bot envía el menú de documentos', async () => {
        await handleIncomingMessage(createMsg("Hola bot"));

        const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
        const replyLog = logCalls.find(log => log.includes('[MOCK SEND MENU]'));
        
        await addMsg({ message: `🤖 BOT RESPONDE A SALUDO:\n${replyLog ? replyLog.replace('[MOCK SEND MENU]', '').trim() : 'NOT FOUND'}` });
        
        expect(replyLog).toBeDefined();
        expect(replyLog).toContain('Hola Juan Tester');
        expect(replyLog).toContain('*DNI* — Frente');

        const state = userStates.get('5491158232588');
        expect(state).toBeDefined();
        expect(state.step).toBe('ESPERANDO_OPCION_DOCUMENTO');
    });

    test('Paso 2: Selección de documento -> El bot pide la foto', async () => {
        userStates.set('5491158232588', {
            clientId: 'mock-123',
            pendingDocs: [{ idDocument: 'doc-1', nameDocument: 'DNI' }],
            step: 'ESPERANDO_OPCION_DOCUMENTO'
        });

        await handleIncomingMessage(createMsg("1"));

        const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
        const replyLog = logCalls.find(log => log.includes('[MOCK SEND REPLY]'));
        await addMsg({ message: `🤖 BOT RESPONDE A ELECCIÓN:\n${replyLog ? replyLog.replace('[MOCK SEND REPLY]', '').trim() : 'NOT FOUND'}` });

        expect(replyLog).toBeDefined();
        expect(replyLog).toContain('Por favor enviame la foto o PDF de *DNI*');

        const state = userStates.get('5491158232588');
        expect(state.step).toBe('ESPERANDO_FOTO');
        expect(state.selectedDocId).toBe('doc-1');
    });

    test('Paso 3: Error de opción -> El bot vuelve a pedir número correcto', async () => {
        userStates.set('5491158232588', {
            clientId: 'mock-123',
            pendingDocs: [{ idDocument: 'doc-1', nameDocument: 'DNI' }],
            step: 'ESPERANDO_OPCION_DOCUMENTO'
        });

        await handleIncomingMessage(createMsg("a"));

        const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
        const errorLog = logCalls.find(log => log.includes('[MOCK SEND REPLY]') && log.includes('Opción inválida'));
        await addMsg({ message: `🤖 BOT RESPONDE A ERROR:\n${errorLog ? errorLog.replace('[MOCK SEND REPLY]', '').trim() : 'NOT FOUND'}` });

        expect(errorLog).toBeDefined();
        const state = userStates.get('5491158232588');
        expect(state.step).toBe('ESPERANDO_OPCION_DOCUMENTO');
    });

    test('Paso 4: Envío de archivo válido -> El bot valida con la API', async () => {
        userStates.set('5491158232588', {
            clientId: 'mock-123',
            step: 'ESPERANDO_FOTO',
            selectedDocId: 'doc-1'
        });

        await handleIncomingMessage(createMsg("", true));

        const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
        // Ajustamos la búsqueda para ser más flexibles con los emojis
        const successLog = logCalls.find(log => log.includes('[MOCK SEND REPLY]') && (log.includes('Documento válido') || log.includes('✔')));
        await addMsg({ message: `🤖 BOT RESPONDE A VALIDACIÓN:\n${successLog ? successLog.replace('[MOCK SEND REPLY]', '').trim() : 'NOT FOUND'}` });

        expect(successLog).toBeDefined();
        expect(apiService.validateDocument).toHaveBeenCalledWith('doc-1', 'mock-123', 'base64data');
        
        const state = userStates.get('5491158232588');
        expect(state.step).toBe('ESPERANDO_OPCION_DOCUMENTO');
    });

    test('Paso 5: Cliente sin documentos pendientes -> El bot envía QR de acceso', async () => {
        apiService.getPendingDocuments.mockResolvedValueOnce({ documentList: [] });
        apiService.getClientQR.mockResolvedValueOnce({ base64: "dummy_qr_base64_string" });

        await handleIncomingMessage(createMsg("Hola de nuevo"));

        const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
        const qrLog = logCalls.find(log => log.includes('[MOCK SEND REPLY]') && log.includes('Aquí tienes tu QR de acceso'));
        await addMsg({ message: `🤖 BOT RESPONDE A QR:\n${qrLog ? qrLog.replace('[MOCK SEND REPLY]', '').trim() : 'NOT FOUND'}` });

        expect(qrLog).toBeDefined();
        expect(apiService.getClientQR).toHaveBeenCalledWith('mock-123');
        
        const state = userStates.get('5491158232588');
        expect(state).toBeUndefined();
    });
});
