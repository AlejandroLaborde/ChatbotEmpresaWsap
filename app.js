/**
 * ⚡⚡⚡ DECLARAMOS LAS LIBRERIAS y CONSTANTES A USAR! ⚡⚡⚡
 */
require('dotenv').config();

// --- DASHBOARD LOG INTERCEPTOR ---
let serverLogs = [
    { id: Date.now(), time: new Date().toLocaleTimeString(), msg: "PANEL DE CONTROL INICIADO - CONECTOR LISTO", type: "info" }
];
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
    originalLog.apply(console, args);
    serverLogs.push({
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
        type: 'info'
    });
    if (serverLogs.length > 100) serverLogs.shift();
};

console.error = function (...args) {
    originalError.apply(console, args);
    serverLogs.push({
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
        type: 'error'
    });
    if (serverLogs.length > 100) serverLogs.shift();
};
// ---------------------------------
const fs = require('fs');
const mimeDb = require('mime-db')

const express = require('express');
const moment = require('moment');
const ora = require('ora');
const chalk = require('chalk');
const ExcelJS = require('exceljs');
const qrcode = require('qrcode-terminal');
const qr = require('qrcode');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const apiService = require('./services/api.service');
const flow = require('./flow/steps.json')
const messages = require('./flow/messages.json');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const SESSION_FILE_PATH = './session.json';
let port = process.env.PORT || 3100
let client;
let sessionData;
let qrclient = "Not found";
let clientReady = false;
let otraSession = false;
let qrGenerationTimer = null; // Timer para frenar la generación de QR

// Estado de conversación en memoria
const userStates = new Map();

/**
 * 🔁 FLAG DE MODO
 * false → usa las APIs reales de CelerPass (modo producción)
 * true  → usa los mocks locales (modo desarrollo/testing)
 */
const workWithMock = false;
const withDummyNumberCris = false;
const DUMMY_NUMBER_CRIS = "5491158232588";
const MOCK_MSG_SEND = process.env.MOCK_MSG_SEND === 'true'; // false → envía mensajes reales | true → loguea en consola sin enviar

/**
 * Seattings
 */
app.set('appName', 'Chatbot personalizado');
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + "/public"));
app.use('/mediaSend', express.static(__dirname + '/mediaSend'));



/**
 * Guardamos archivos multimedia que nuestro cliente nos envie!
 * @param {*} media 
 */
const saveMedia = (media) => {
    const extensionProcess = mimeDb[media.mimetype]
    const ext = extensionProcess.extensions[0]
    fs.writeFile(`./media/${media.filename}.${ext}`, media.data, { encoding: 'base64' }, function (err) {
        console.log('** Archivo Media Guardado.. **');
    });
}

/**
 * Enviamos archivos multimedia a nuestro cliente
 * @param {*} number 
 * @param {*} fileName 
 */
const sendMedia = (number, fileName) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`

    if (MOCK_MSG_SEND) {
        console.log(chalk.yellow(`[MOCK SEND MEDIA] Para: ${number} | Archivo: ${fileName}`));
        return;
    }

    const media = MessageMedia.fromFilePath(`./mediaSend/${fileName}`);
    client.sendMessage(number, media);
}

/**
 * Enviamos un mensaje simple (texto) a nuestro cliente
 * @param {*} number 
 */
const sendMessage = async (number = null, text = null) => {
    let cleanNumber = number.replace(/\D/g, '');

    // Normalizar números de Argentina agregando el 9 (5411... -> 54911...)
    if (cleanNumber.startsWith('54') && cleanNumber.length === 12) {
        cleanNumber = '549' + cleanNumber.substring(2);
    }

    if (withDummyNumberCris) {
        cleanNumber = DUMMY_NUMBER_CRIS;
    }

    if (MOCK_MSG_SEND) {
        console.log(chalk.yellow(`[MOCK SEND] Para: ${cleanNumber} | Texto: ${text}`));
        return;
    }

    try {
        const contactId = await client.getNumberId(cleanNumber);
        if (contactId) {
            await client.sendMessage(contactId._serialized, text);
            console.log(`[LOG] Mensaje directo enviado a ${cleanNumber}`);

            try {
                readChatJson(cleanNumber, text);
            } catch (error) {
                console.log("excel", error)
            }
        } else {
            console.log(`[ERROR] El número ${cleanNumber} no existe en WhatsApp.`);
        }
    } catch (err) {
        console.log(`[ERROR] al mandar a ${number}:`, err.message || err);
    }
}

// MOCK Endpoint 3: /pending-documents
const mockPendingDocuments = (clientId) => {
    console.log(`[MOCK] Buscando documentación pendiente para cliente: ${clientId}`);

    return {
        documentList: [
            {
                nameDocument: "DNI",
                descripcionDocument: "Foto del frente del DNI",
                idDocument: "doc-001"
            },
            {
                nameDocument: "Factura",
                descripcionDocument: "Factura del último servicio",
                idDocument: "doc-002"
            },
            {
                nameDocument: "Certificado laboral",
                descripcionDocument: "Certificado firmado por la empresa",
                idDocument: "doc-003"
            }
        ]
    };
};

// MOCK Endpoint 1: /validate-phone-number
const mockValidatePhoneNumber = (number) => {
    console.log(`[MOCK] Validando número: ${number}`);
    return { clientId: "mock-client-001", isClient: true, message: "Cliente válido (mock)" };
};

const buildDynamicPendingDocsMessage = (cliente, companyName, documentList) => {
    let mensaje = `Hola ${cliente.name}! 👋\n`;
    mensaje += `Para tu próxima visita en *${companyName}* necesitamos la siguiente documentación:\n\n`;

    documentList.forEach((doc, index) => {
        mensaje += `${index + 1}) *${doc.nameDocument}* — ${doc.descripcionDocument}\n`;
    });

    mensaje += `\nPor favor enviá el número de la opción que quieras cargar.`;

    return mensaje;
};



const sendPendingDocsMenu = async (chatId, clienteValidado, contactName = "Cliente") => {
    try {
        const docsPendientes = await apiService.getPendingDocuments(clienteValidado.clientId);
        
        // --- 🌟 NUEVO: Si no hay docs, enviar QR ---
        if (!docsPendientes?.documentList || docsPendientes.documentList.length === 0) {
            console.log(`[LOG] Sin documentos pendientes para ${clienteValidado.clientId}. Generando QR...`);
            const qrData = await apiService.getClientQR(clienteValidado.clientId);
            if (qrData?.base64) {
                const media = new MessageMedia('image/png', qrData.base64);
                await client.sendMessage(chatId, media, { caption: "No tienes documentación pendiente. Aquí tienes tu QR de acceso." });
            } else {
                await client.sendMessage(chatId, "No tienes documentación pendiente. Estamos procesando tu QR, por favor reintenta en unos momentos.");
            }
            return;
        }

        const activeNumber = chatId.replace('@c.us', '');
        let cleanNumberCheck = activeNumber.startsWith('54') && activeNumber.length === 12 
            ? '549' + activeNumber.substring(2) 
            : activeNumber;
            
        const targetNumber = withDummyNumberCris ? DUMMY_NUMBER_CRIS : cleanNumberCheck;

        userStates.set(targetNumber, {
            clientId: clienteValidado.clientId,
            pendingDocs: docsPendientes.documentList,
            step: "ESPERANDO_OPCION_DOCUMENTO",
            selectedDocId: null
        });

        const mensaje = buildDynamicPendingDocsMessage(
            { name: contactName },
            "nuestra plataforma",
            docsPendientes.documentList
        );

        if (MOCK_MSG_SEND) {
            console.log(chalk.yellow(`[MOCK SEND MENU] Para: ${chatId} | Mensaje: ${mensaje}`));
        } else {
            await client.sendMessage(chatId, mensaje);
            console.log(`[LOG] Menú de documentos enviado a ${chatId}`);
        }
    } catch (err) {
        console.log("[ERROR] Fallo al enviar menú de documentos:", err.message);
    }
};

const activeMessag = () => {
    setInterval(async () => {
        if (!clientReady) {
            console.log("[LOG] Ciclo abortado: No hay sesión activa de WhatsApp.");
            return;
        }

        console.log("=== EJECUTANDO activeMessag() ===");
        console.log(`[LOG] Modo: ${workWithMock ? 'MOCK' : 'API REAL'}`);

        try {
            let companyName;
            let lista;

            if (workWithMock) {
                // ============================================================
                // 🟡 MODO MOCK — datos hardcodeados localmente
                // ============================================================
                console.log("[MOCK] Endpoint 2: /pending-clients");
                const response = {
                    data: {
                        companyName: "Coca-Cola",
                        list: [
                            {
                                clientId: "abc-123",
                                name: "Matias",
                                number: "5491111111111",
                                direc: "Avenida Siempreviva 742",
                                hourAndDate: "10:00 20/11/2025"
                            },
                            {
                                clientId: "def-456",
                                name: "Alejandro",
                                number: "5492222222222",
                                direc: "Calle Falsa 123",
                                hourAndDate: "11:00 20/11/2025"
                            },
                            {
                                clientId: "ghi-789",
                                name: "Cris",
                                number: "5493333333333",
                                direc: "Av. Libertador 5000",
                                hourAndDate: "13:30 20/11/2025"
                            }
                        ]
                    }
                };
                let empresasRaw = response.data;
                companiesResponse = Array.isArray(empresasRaw) ? empresasRaw : [empresasRaw];
            } else {
                // ============================================================
                // 🟢 MODO API REAL — llama a CelerPass
                // ============================================================
                const apiResponse = await apiService.getPendingClients();
                companiesResponse = Array.isArray(apiResponse) ? apiResponse : [apiResponse];
            }

            if (!companiesResponse || companiesResponse.length === 0) {
                console.log("[LOG] No hay empresas retornadas por la API.");
                return;
            }

            for (const emp of companiesResponse) {
                const companyName = emp.companyName;
                const lista = emp.list;

                if (!lista || lista.length === 0) {
                    console.log(`[LOG] No hay clientes pendientes para ${companyName || 'N/A'}`);
                    continue;
                }

                console.log(`[LOG] Empresa: ${companyName}`);
                console.log(`[LOG] Clientes con documentación pendiente: ${lista.length}`);

                for (const cliente of lista) {
                    console.log("-------------------------------------------");
                    console.log(`[LOG] Procesando cliente: ${cliente.name} | ${cliente.number}`);

                    let cleanNumber = cliente.number.replace(/\D/g, '');
                    if (cleanNumber.startsWith('54') && cleanNumber.length === 12) {
                        cleanNumber = '549' + cleanNumber.substring(2);
                    }

                    if (withDummyNumberCris) {
                        cleanNumber = DUMMY_NUMBER_CRIS;
                    }

                    let docsPendientes;

                    if (workWithMock) {
                        docsPendientes = mockPendingDocuments(cliente.clientId);
                    } else {
                        docsPendientes = await apiService.getPendingDocuments(cliente.clientId);
                    }

                    // --- 🌟 NUEVO: Si no hay docs, enviar QR ---
                    if (!docsPendientes?.documentList || docsPendientes.documentList.length === 0) {
                        console.log(`[LOG] Sin docs para ${cliente.name} (${cleanNumber}). Enviando QR...`);
                        
                        if (MOCK_MSG_SEND) {
                            console.log(chalk.yellow(`[MOCK QR] Para: ${cliente.name} (${cleanNumber})`));
                        } else {
                            try {
                                const contactId = await client.getNumberId(cleanNumber);
                                if (contactId) {
                                    const qrData = await apiService.getClientQR(cliente.clientId);
                                    if (qrData?.base64) {
                                        const media = new MessageMedia('image/png', qrData.base64);
                                        await client.sendMessage(contactId._serialized, media, { caption: `Hola ${cliente.name}, aquí tienes tu código QR de acceso.` });
                                    }
                                }
                            } catch (err) {
                                console.log(`[ERROR] enviando QR a ${cliente.name}:`, err.message);
                            }
                        }
                        continue;
                    }

                    // Guardar estado inicial para esperar opción del cliente
                    userStates.set(cleanNumber, {
                        clientId: cliente.clientId,
                        pendingDocs: docsPendientes?.documentList || [],
                        step: "ESPERANDO_OPCION_DOCUMENTO",
                        selectedDocId: null
                    });

                    const mensaje = buildDynamicPendingDocsMessage(
                        cliente,
                        companyName,
                        docsPendientes.documentList
                    );

                    if (MOCK_MSG_SEND) {
                        console.log(chalk.yellow(`[MOCK SEND PENDING] Para: ${cliente.name} (${cleanNumber}) | Mensaje: ${mensaje}`));
                        console.log(`[LOG] Mensaje pendiente enviado a ${cliente.name} (${cleanNumber})`);
                        continue;
                    }

                    try {
                        const contactId = await client.getNumberId(cleanNumber);
                        if (contactId) {
                            await client.sendMessage(contactId._serialized, mensaje);
                            console.log(`[LOG] Mensaje pendiente enviado a ${cliente.name} (${cleanNumber})`);
                        } else {
                            console.log(`[ERROR] El WhatsApp no está registrado para ${cliente.name} (${cleanNumber})`);
                        }
                    } catch (err) {
                        console.log(`[ERROR] enviando a ${cliente.name} (${cliente.number}):`, err.message || err);
                    }
                }
            }

            console.log("[LOG] Finalizó el ciclo.");

        } catch (error) {
            console.log("[ERROR] Falló activeMessag():", error.message || error);
        }

    }, process.env.POLLING_FREQUENCY_MS || 14400000);
};



const handleIncomingMessage = async (msg) => {
    const { from, body } = msg;

    console.log("=== Nuevo mensaje ===");
    console.log("De:", from);
    console.log("Mensaje:", body);
    console.log(`[LOG] Modo: ${workWithMock ? 'MOCK' : 'API REAL'}`);

    // Ignorar estados y grupos
    if (from === 'status@broadcast' || from.toString().length > 27) {
        console.log("[LOG] Mensaje de estado o grupo → ignorando");
        return;
    }

    // ================================================================
    // ENDPOINT 1 — Validar si el número es cliente registrado
    // ================================================================
    let clienteValidado = null;
    try {
        const numero = `+${from.replace('@c.us', '')}`;

        if (withDummyNumberCris) {
            clienteValidado = { isClient: true, clientId: "dummy-client-cris", message: "Cliente válido (Dummy Cris)" };
        } else if (workWithMock) {
            clienteValidado = mockValidatePhoneNumber(numero);
        } else {
            clienteValidado = await apiService.validatePhoneNumber(numero);
        }
        console.log(`[LOG] Endpoint 1 → isClient: ${clienteValidado?.isClient} | clientId: ${clienteValidado?.clientId}`);
    } catch (err) {
        console.log("[ERROR] No se pudo validar el número:", err.message || err);
    }

    // Si llega un archivo media
    if (msg.hasMedia) {
        console.log("[LOG] Usuario envió documentación (archivo)");

        if (withDummyNumberCris) {
            try {
                console.log("[API] Descargando archivo media...");
                const media = await msg.downloadMedia();
                const base64 = media.data;

                const numeroParaEstado = from.replace('@c.us', '');
                const cleanNumberEstado = numeroParaEstado.startsWith('54') && numeroParaEstado.length === 12 
                    ? '549' + numeroParaEstado.substring(2) 
                    : numeroParaEstado;
                const activeNumber = withDummyNumberCris ? DUMMY_NUMBER_CRIS : cleanNumberEstado;
                
                const uState = userStates.get(activeNumber);
                const idDocument = uState?.selectedDocId || null; 
                const clientId = uState?.clientId || clienteValidado?.clientId || null;

                if (!idDocument) {
                    console.log("[LOG] Usuario envió media sin seleccionar documento primero.");
                    const replyMsg = "⚠️ Por favor, seleccioná primero qué documento vas a subir enviando el número correspondiente del menú.";
                    if (MOCK_MSG_SEND) {
                        console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ${replyMsg}`));
                    } else {
                        client.sendMessage(from, replyMsg);
                    }
                    return;
                }
                
                // Resetear estado opcionalmente
                if (uState) {
                    uState.step = "ESPERANDO_OPCION_DOCUMENTO";
                    uState.selectedDocId = null;
                }

                const resultado = await apiService.validateDocument(idDocument, clientId, base64);

                if (!resultado.documentValid) {
                    const motivo = resultado.message || "Documento inválido";
                    const sugerencia = resultado.sugestion ? ` Sugerencia: ${resultado.sugestion}` : "";
                    if (MOCK_MSG_SEND) {
                        console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ❌ ${motivo}.${sugerencia}`));
                    } else {
                        client.sendMessage(from, `❌ ${motivo}.${sugerencia}`);
                    }
                    return;
                }

                if (MOCK_MSG_SEND) {
                    console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ✔ ${resultado.message || 'Documento válido. Procesado correctamente.'}`));
                } else {
                    client.sendMessage(from, `✔ ${resultado.message || 'Documento válido. Procesado correctamente.'}`);
                }
            } catch (err) {
                console.log("[ERROR] Fallo al validar documento via API:", err.message || err);
                if (MOCK_MSG_SEND) {
                    console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ⚠ Hubo un error al procesar tu documento. Intentá de nuevo.`));
                } else {
                    client.sendMessage(from, "⚠ Hubo un error al procesar tu documento. Intentá de nuevo.");
                }
            }
            return;
        }

        if (workWithMock) {
            // ============================================================
            // 🟡 MODO MOCK — validación aleatoria
            // ============================================================
            console.log("[MOCK] Endpoint 4: validate-document (aleatoria)");
            const valida = Math.random() > 0.5;

            if (!valida) {
                console.log("[MOCK] DOCUMENTO INVALIDO");
                if (MOCK_MSG_SEND) {
                    console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ❌ La documentación es incorrecta. Motivo: ejemplo. Consejos: reenviá una foto más clara.`));
                } else {
                    client.sendMessage(from, "❌ La documentación es incorrecta. Motivo: ejemplo. Consejos: reenviá una foto más clara.");
                }
                return;
            }

            console.log("[MOCK] DOCUMENTO VÁLIDO");
            if (MOCK_MSG_SEND) {
                console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ✔ Documento válido. Procesado correctamente.`));
            } else {
                client.sendMessage(from, "✔ Documento válido. Procesado correctamente.");
            }
            return;
        } else {
            // ============================================================
            // 🟢 MODO API REAL — descarga el media y envía a CelerPass
            // ============================================================
            try {
                console.log("[API] Descargando archivo media...");
                const media = await msg.downloadMedia();
                const base64 = media.data;

                const numeroParaEstado = from.replace('@c.us', '');
                const cleanNumberEstado = numeroParaEstado.startsWith('54') && numeroParaEstado.length === 12 
                    ? '549' + numeroParaEstado.substring(2) 
                    : numeroParaEstado;
                const activeNumber = withDummyNumberCris ? DUMMY_NUMBER_CRIS : cleanNumberEstado;
                
                const uState = userStates.get(activeNumber);
                const idDocument = uState?.selectedDocId || null; 
                const clientId = uState?.clientId || clienteValidado?.clientId || null;

                if (!idDocument) {
                    console.log("[LOG] Usuario envió media sin seleccionar documento primero.");
                    const replyMsg = "⚠️ Por favor, seleccioná primero qué documento vas a subir enviando el número correspondiente del menú.";
                    if (MOCK_MSG_SEND) {
                        console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ${replyMsg}`));
                    } else {
                        client.sendMessage(from, replyMsg);
                    }
                    return;
                }
                
                // Resetear estado opcionalmente
                if (uState) {
                    uState.step = "ESPERANDO_OPCION_DOCUMENTO";
                    uState.selectedDocId = null;
                }

                const resultado = await apiService.validateDocument(idDocument, clientId, base64);

                if (!resultado.documentValid) {
                    const motivo = resultado.message || "Documento inválido";
                    const sugerencia = resultado.sugestion ? ` Sugerencia: ${resultado.sugestion}` : "";
                    if (MOCK_MSG_SEND) {
                        console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ❌ ${motivo}.${sugerencia}`));
                    } else {
                        client.sendMessage(from, `❌ ${motivo}.${sugerencia}`);
                    }
                    return;
                }

                if (MOCK_MSG_SEND) {
                    console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ✔ ${resultado.message || 'Documento válido. Procesado correctamente.'}`));
                } else {
                    client.sendMessage(from, `✔ ${resultado.message || 'Documento válido. Procesado correctamente.'}`);
                }
            } catch (err) {
                console.log("[ERROR] Fallo al validar documento via API:", err.message || err);
                if (MOCK_MSG_SEND) {
                    console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ⚠ Hubo un error al procesar tu documento. Intentá de nuevo.`));
                } else {
                    client.sendMessage(from, "⚠ Hubo un error al procesar tu documento. Intentá de nuevo.");
                }
            }
            return;
        }
    }

    // Si llega texto
    console.log("[LOG] Usuario envió texto:", body);
    
    const numeroText = from.replace('@c.us', '');
    const cleanNumberText = numeroText.startsWith('54') && numeroText.length === 12 
        ? '549' + numeroText.substring(2) 
        : numeroText;
        
    const activeNumText = withDummyNumberCris ? DUMMY_NUMBER_CRIS : cleanNumberText;
    const uStateText = userStates.get(activeNumText);

    if (uStateText && uStateText.step === "ESPERANDO_OPCION_DOCUMENTO") {
        const optionIndex = parseInt(body) - 1;
        if (!isNaN(optionIndex) && optionIndex >= 0 && optionIndex < (uStateText.pendingDocs?.length || 0)) {
            const selectedDoc = uStateText.pendingDocs[optionIndex];
            console.log(`[LOG] Usuario eligió opción ${body} -> Documento: ${selectedDoc.nameDocument}`);
            
            uStateText.selectedDocId = selectedDoc.idDocument;
            uStateText.step = "ESPERANDO_FOTO";
            
            const replyMsg = `Entendido. Por favor enviame la foto o PDF de *${selectedDoc.nameDocument}* ahora.`;
            if (MOCK_MSG_SEND) {
                console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ${replyMsg}`));
            } else {
                client.sendMessage(from, replyMsg);
            }
            return;
        } else {
            // Si mandó algo que no es un número válido de la lista
            console.log(`[LOG] Opción numérica inválida: ${body}`);
            const replyMsg = `⚠️ Opción inválida. Por favor, respondé con un número del 1 al ${uStateText.pendingDocs?.length || 1}.`;
            if (MOCK_MSG_SEND) {
                console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ${replyMsg}`));
            } else {
                client.sendMessage(from, replyMsg);
            }
            return;
        }
    }

    if (uStateText && uStateText.step === "ESPERANDO_FOTO") {
        const replyMsg = "📸 Sigo esperando la foto o PDF del documento seleccionado. Por favor, adjuntá el archivo.";
        if (MOCK_MSG_SEND) {
            console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: ${replyMsg}`));
        } else {
            client.sendMessage(from, replyMsg);
        }
        return;
    }

    // 🌟 NUEVA LÓGICA: Si es un cliente válido y no estamos en un paso específico, disparamos el menú
    if (clienteValidado?.isClient) {
        console.log(`[LOG] Cliente validado iniciando flujo de documentos: ${from}`);
        const contact = await msg.getContact();
        const contactName = contact.name || contact.pushname || "Cliente";
        await sendPendingDocsMenu(from, clienteValidado, contactName);
        return;
    }

    // Fallback si no fue activado por nada de lo anterior
    if (body === "1") {
        // ... (resto de fallbacks opcionales)
        console.log("[LOG] Usuario eligió opción 1 (fallback)");
        if (MOCK_MSG_SEND) {
            console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: Enviame la foto del DNI ahora.`));
        } else {
            client.sendMessage(from, "Enviame la foto del DNI ahora.");
        }
        return;
    }

    if (body === "2") {
        console.log("[LOG] Usuario eligió opción 2 (fallback)");
        if (MOCK_MSG_SEND) {
            console.log(chalk.yellow(`[MOCK SEND REPLY] Para: ${from} | Texto: Enviame la factura en PDF o foto.`));
        } else {
            client.sendMessage(from, "Enviame la factura en PDF o foto.");
        }
        return;
    }
};

const listenMessage = () => {
    client.on('message', handleIncomingMessage);
};



/**
 * Escuchamos cuando entre un mensaje
 */
const listenChanges = () => {

    client.on('disconnected', () => {
        otraSession = true;
    })
}


/**
 * Response a pregunta
 */


//🟥🟧🟨🟩🟦🟪🟫⬛🟥🟧🟨🟩🟦🟪🟫⬛
const replyAsk = (from, answer, clientExist) => new Promise((resolve, reject) => {


    if (clientExist) {

        if (flow.STEP_1.includes(answer.toLowerCase())) {
            sendMessage(from, messages.INFORMACION.join(''));
            sendVolverMenu(from);
        }
        else if (flow.STEP_2.includes(answer.toLowerCase())) {
            sendMessage(from, messages.ENCONTRARNOS.join(''));
            sendVolverMenu(from);
        }
        else if (flow.STEP_3.includes(answer.toLowerCase())) {
            sendMessage(from, messages.CONTACTO.join(''));
            sendVolverMenu(from);
        }
        else if (flow.STEP_4.includes(answer.toLowerCase())) {
            sendMessage(from, messages.MEDIDA.join(''));
            sendVolverMenu(from);
        }

        else if (flow.STEP_0.includes(answer.toLowerCase())) {
            sendMessage(from, messages.MENU.join(''));
        }
        else if (flow.STEP_9.includes(answer.toLowerCase())) {
            sendMedia(from, "logo-vertical.png");
            sendMessage(from, messages.SALUDO_FINAL.join(''));
        }
        else {
            message = ""
        }
    }

    return

})

function sendVolverMenu(from) {
    setTimeout(() => {
        log(from, "0", messages.VOLVER_MENU.join(''));
        sendMessage(from, messages.VOLVER_MENU.join(''));
    }, 2500);
}

function log(from, answer, response) {
    console.log("# ", from, " # ", answer, " # ", response);
}

/**
 * El bot ahora usa LocalAuth exclusivamente, que maneja la sesión automáticamente
 * en la carpeta ./.wwebjs_auth. No se requiere session.json antiguo.
 */

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {
    console.log('🔄 No tenemos sesión guardada, iniciando nueva...');

    otraSession = false;
    qrclient = "Not found";

    if (qrGenerationTimer) clearTimeout(qrGenerationTimer);
    
    // Configurar timeout de 2 minutos para destruir la instancia
    qrGenerationTimer = setTimeout(() => {
        if (!clientReady && client) {
            console.log('⏳ Tiempo de espera para escanear QR agotado. Frenando generación...');
            client.destroy().catch(()=>{}).finally(()=>{
                client = null;
                qrclient = "TIMEOUT";
            });
        }
    }, 120000);

    // RUTA CONSISTENTE DE SESIÓN
    const AUTH_DIR = './.wwebjs_auth';

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: "client",
            dataPath: AUTH_DIR
        }),

        /* webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }, */

        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-gpu',
                '--no-zygote',
                '--single-process',
                '--disable-client-side-phishing-detection',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--no-first-run',
                '--safebrowsing-disable-auto-update'
            ]
        }
    });

    // 📌 QR para emparejar
    client.on('qr', qr => {
        console.log("📱 Escaneá el código QR para continuar");
        qrcode.generate(qr, { small: true });
        qrclient = qr;
    });

    // 📌 Autenticado correctamente
    client.on('authenticated', () => {
        console.log('🔐 Autenticación exitosa');
    });

    // 📌 Si falla la autenticación → borrar sesión y reiniciar
    client.on('auth_failure', msg => {
        console.log('❌ Error de autenticación:', msg);

        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log('🧹 Carpeta de sesión eliminada. Intentando nuevamente...');
        }

        client = null;
        withOutSession(); // retry
    });

    // 📌 Cuando WhatsApp está completamente listo
    client.on('ready', () => {
        console.log('✅ CLIENT READY — Conexión establecida');
        if (qrGenerationTimer) clearTimeout(qrGenerationTimer);
        otraSession = false;
        clientReady = true;

        // Limpiar qrclient porque ya estamos autenticados!
        qrclient = "Not found";

        // llamás tu lógica
        connectionReady();
    });

    // 📌 Errores de Puppeteer / conexión
    client.on('disconnected', reason => {
        console.log('⚠ Cliente desconectado:', reason);
        clientReady = false;

        // Limpieza de sesión para evitar loops
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log("🧹 Sesión eliminada por seguridad");
        }

        withOutSession();
    });

    // 📌 Iniciar cliente
    client.initialize().catch(err => {
        console.error("💥 Error crítico en initialize:", err);

        // Si hay una falla de sesión (como TargetCloseError o similar) al inicio, 
        // intentamos limpiar la carpeta y forzar un re-escaneo
        if (err.message.includes('target') || err.message.includes('Protocol error')) {
            console.log("🧹 Detectado error de sesión/browser. Limpiando y reintentando...");
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
            // Pequeña espera antes de reintentar
            setTimeout(() => withOutSession(), 3000);
        }
    });
};

let intervalStarted = false;

const connectionReady = () => {
    console.log("Client is ready!");

    listenMessage();
    listenChanges();

    if (!intervalStarted) {
        console.log("[LOG] Iniciando proceso automático cada 4 horas...");
        activeMessag();
        intervalStarted = true;
    }
}

const readChatJson = async (number, message) => {
    const pathJson = `./chats/${number}.json`;
    const today = moment().format('MM-DD-YYYY HH:mm ');

    try {
        if (fs.existsSync(pathJson)) {
            fs.writeFile(pathJson, JSON.stringify({ fecha: today }), function (err) {
                if (err) { console.log(err); }
            });
        } else {
            fs.writeFile(pathJson, JSON.stringify({ fecha: today }), function (err) {
                if (err) { console.log(err); }
            });
        }
    } catch (error) {
        console.log(error)
    }
}

/**
 * Lee la ultima fila del excel, con la intension de sacar la fecha y hora (EN PRINCIPIO)
 * @param {*} number 
 * @param {*} message 
 */
const readLastFileJsonAndResponse = async (number, body) => {
    const pathJson = `./chats/${number}.json`;
    const today = moment();
    if (fs.existsSync(pathJson)) {
        try {
            fs.readFile(pathJson, (err, data) => {
                if (err) console.log(err);
                let ultimaFecha = JSON.parse(data);
                let fecha = moment(ultimaFecha.fecha);
                const diffMinutes = today.diff(fecha, 'minutes');
                if (diffMinutes > 720) {
                    sendMessage(number, messages.BIENVENIDA.join(''));
                    sendMessage(number, messages.MENU.join(''));
                } else {
                    replyAsk(number, body, true);
                }
            });
        } catch (error) {
            console.log("Json Error", error)
            replyAsk(number, body, true);
        }
    }
}

/**
 * Saludos a primera respuesta
 * @param {*} req 
 * @param {*} res 
 */
const greetCustomer = (from) => new Promise((resolve, reject) => {
    from = from.replace('@c.us', '');

    const pathExcel = `./chats/${from}@c.us.json`;
    if (!fs.existsSync(pathExcel)) {

        sendMessage(from, messages.BIENVENIDA.join(''));
        sendMessage(from, messages.MENU.join(''));

    }
    resolve(true)
})

/**
 * Controladores
 */

const sendMessagePost = (req, res) => {
    const { message, number } = req.body
    console.log(message, number);
    sendMessage(number, message)
    res.send({ status: 'Enviado!' })
}

/**
 * Rutas
 */
app.get('/', (req, res) => {
    res.redirect("/inicio")
})

app.get('/inicio', (req, res) => {
    qr.toDataURL(qrclient, (err, src) => {
        if (err) res.send("Error occured");
        res.render(__dirname + '/views/index', {
            titulo: app.get('appName'),
            qrclient: qrclient,
            clientReady: clientReady,
            src: src,
            otraSession: otraSession
        })
    });
})

// app.get('/session', (req, res) => {
//     qr.toDataURL(qrclient, (err, src) => {
//         if (err) res.send("Error occured");
//         res.render(__dirname + '/views/session', { titulo: app.get('appName'), qrclient: qrclient, clientReady: clientReady, src: src })
//     });
// })

// app.get('/running', (req, res) => {
//     qr.toDataURL(qrclient, (err, src) => {
//         if (err) res.send("Error occured");
//         res.render(__dirname + '/views/running', { titulo: app.get('appName'), qrclient: qrclient, clientReady: clientReady, src: src })
//     });
// })

app.get('/actualizar', async (req, res) => {
    res.send({
        clientReady: clientReady,
        otraSession: otraSession,
        mockMode: MOCK_MSG_SEND
    }).end()
})

app.get('/reconectar', async (req, res) => {
    otraSession = false;
    clientReady = false;
    withOutSession();
    res.send({ clientReady: clientReady, otraSession: otraSession }).end()
})

app.get('/desconectar', (req, res) => {
    client.destroy().then(resp => {
    }).finally(() => {
        const AUTH_DIR = './.wwebjs_auth';
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        client = null;
        withOutSession();
    })

    otraSession = false;
    clientReady = false;
    qr.toDataURL(qrclient, (err, src) => {
        if (err) res.send("Error occured");

        res.redirect("/inicio");
    });

})


app.get('/codigo', async (req, res) => {
    const session = (client && clientReady && client.info) ? {
        pushname: client.info.pushname,
        number: client.info.wid.user
    } : null;

    if (qrclient === "TIMEOUT") {
        return res.send({
            src: "TIMEOUT",
            clientReady: clientReady,
            otraSession: otraSession,
            mockMode: MOCK_MSG_SEND,
            logs: serverLogs,
            session: session
        });
    }

    qr.toDataURL(qrclient, (err, src) => {
        if (err) return res.status(500).send({ error: "QR Error" });

        res.send({
            src: src,
            clientReady: clientReady,
            otraSession: otraSession,
            mockMode: MOCK_MSG_SEND,
            logs: serverLogs,
            session: session
        });
    });
});

app.get('/live-conversations', async (req, res) => {
    if (!clientReady || !client) {
        return res.send({ conversations: [] });
    }
    
    try {
        const chats = await client.getChats();
        const userChats = chats.filter(c => !c.isGroup);
        // Ordenamos por timestamp mas reciente
        userChats.sort((a, b) => b.timestamp - a.timestamp);
        
        // Tomamos los ultimos 10 para no colgar el endpoint
        const topChats = userChats.slice(0, 10);
        
        let conversations = [];
        for (let chat of topChats) {
            const messages = await chat.fetchMessages({ limit: 5 });
            
            // Inferencia básica de estado:
            let lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            let status = 'Activo';
            if (lastMsg) {
                status = lastMsg.fromMe ? 'Respuesta enviada' : 'Esperando respuesta...';
            }

            const contact = await chat.getContact();
            const displayName = contact.name || contact.pushname || contact.number || chat.id.user;

            conversations.push({
                phone: chat.id.user,
                name: displayName,
                status: status,
                updatedAt: chat.timestamp * 1000,
                messages: messages.map(m => ({
                    role: m.fromMe ? 'Asistente' : 'Cliente',
                    text: m.hasMedia ? "📸 [Documento adjunto]" : (m.body || ""),
                    time: m.timestamp * 1000
                }))
            });
        }
        res.send({ conversations });
    } catch (error) {
        console.error("Error fetching chats:", error);
        res.send({ conversations: [] });
    }
});

app.post('/simulate', async (req, res) => {
    const { from, body, hasMedia, mediaData } = req.body;

    if (!from || (!body && !hasMedia)) {
        return res.status(400).send({ error: "Faltan datos (from, body/hasMedia)" });
    }

    console.log(`[SIMULACIÓN] Recibiendo mensaje de ${from}: ${body || '[SIN TEXTO]'}${hasMedia ? ' (CON ARCHIVO)' : ''}`);

    const simulatedMsg = {
        from: from.includes('@c.us') ? from : `${from}@c.us`,
        body: body || "",
        hasMedia: !!hasMedia,
        downloadMedia: async () => ({ data: mediaData || "base64_dummy_data" }),
        reply: async (text) => {
            console.log(`[SIMULATED REPLY to ${from}]: ${text}`);
        }
    };

    try {
        await handleIncomingMessage(simulatedMsg);
        res.send({ status: "success", info: "Mensaje simulado procesado" });
    } catch (err) {
        console.error("[ERROR] Simulación fallida:", err);
        res.status(500).send({ error: err.message });
    }
});

app.post('/send', sendMessagePost);

/**
 * Revisamos si existe archivo con credenciales!
 */
withOutSession();


app.listen(port, () => {
    console.log('Server ready!');
})