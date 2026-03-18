const fetch = require('node-fetch');

const BASE_URL = 'https://rlzrtwziuyhvblysplqi.supabase.co/functions/v1';

/**
 * Retorna los headers comunes con Authorization para todos los endpoints
 */
const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.MESSAGING_API_KEY}`
});

/**
 * Endpoint 1 – Validar si un número de teléfono es cliente registrado
 * @param {string} number - Número en formato +549XXXXXXXXXX
 * @returns {{ clientId: string, isClient: boolean, message: string }}
 */
const validatePhoneNumber = async (number) => {
    console.log(`[API] Endpoint 1 → validate-phone-number | number: ${number}`);
    const response = await fetch(`${BASE_URL}/validate-phone-number`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ number })
    });

    if (!response.ok) {
        throw new Error(`[API] validate-phone-number falló: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] Endpoint 1 → respuesta:`, data);
    return data;
};

/**
 * Endpoint 2 – Listado de clientes con documentación pendiente
 * @returns {{ companyName: string, list: Array }}
 */
const getPendingClients = async () => {
    console.log(`[API] Endpoint 2 → pending-clients`);
    const response = await fetch(`${BASE_URL}/pending-clients`, {
        method: 'GET',
        headers: getHeaders()
    });

    if (!response.ok) {
        throw new Error(`[API] pending-clients falló: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const totalClients = Array.isArray(data) ? data.reduce((acc, curr) => acc + (curr.list?.length || 0), 0) : (data?.list?.length ?? 0);
    console.log(`[API] Endpoint 2 → clientes obtenidos en total: ${totalClients}`);
    return data;
};

/**
 * Endpoint 3 – Listado de documentos pendientes de un cliente
 * @param {string} clientId - UUID del cliente
 * @returns {{ documentList: Array }}
 */
const getPendingDocuments = async (clientId) => {
    console.log(`[API] Endpoint 3 → pending-documents | clientId: ${clientId}`);
    const response = await fetch(`${BASE_URL}/pending-documents`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ clientId })
    });

    if (!response.ok) {
        throw new Error(`[API] pending-documents falló: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] Endpoint 3 → documentos pendientes: ${data?.documentList?.length ?? 0}`);
    return data;
};

/**
 * Endpoint 4 – Validar el documento enviado por el cliente
 * @param {string} idDocument - UUID del documento requerido
 * @param {string} clientId - UUID del cliente/empleado
 * @param {string} base64 - Archivo en formato base64
 * @returns {{ documentValid: boolean, message: string, sugestion?: string }}
 */
const validateDocument = async (idDocument, clientId, base64) => {
    console.log(`[API] Endpoint 4 → validate-document | idDocument: ${idDocument} | clientId: ${clientId}`);
    const response = await fetch(`${BASE_URL}/validate-document`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ idDocument, clientId, base64 })
    });

    if (!response.ok) {
        throw new Error(`[API] validate-document falló: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] Endpoint 4 → documentValid: ${data?.documentValid}`);
    return data;
};

/**
 * Endpoint 5 – Generar código QR de acceso para un cliente
 * @param {string} clientId - UUID del cliente
 * @returns {{ base64: string }}
 */
const getClientQR = async (clientId) => {
    console.log(`[API] Endpoint 5 → get-QR | clientId: ${clientId}`);
    const response = await fetch(`${BASE_URL}/get-QR?clientId=${clientId}`, {
        method: 'GET',
        headers: getHeaders()
    });

    if (!response.ok) {
        throw new Error(`[API] get-QR falló: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] Endpoint 5 → QR generado`);
    return data;
};

module.exports = {
    validatePhoneNumber,
    getPendingClients,
    getPendingDocuments,
    validateDocument,
    getClientQR
};
