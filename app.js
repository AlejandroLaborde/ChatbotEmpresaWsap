/**
 * ⚡⚡⚡ DECLARAMOS LAS LIBRERIAS y CONSTANTES A USAR! ⚡⚡⚡
 */
require('dotenv').config();
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
app.use(express.urlencoded({ extended: true }))
const SESSION_FILE_PATH = './session.json';
let port = process.env.PORT || 3100
let client;
let sessionData;
let qrclient = "Not found";
let clientReady = false;
let otraSession = false;

/**
 * 🔁 FLAG DE MODO
 * false → usa las APIs reales de CelerPass (modo producción)
 * true  → usa los mocks locales (modo desarrollo/testing)
 */
const workWithMock = false;
const withDummyNumberCris = true;
const DUMMY_NUMBER_CRIS = "5491158232588";

/**
 * Seattings
 */
app.set('appName', 'Chatbot personalizado');
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + "/public"));



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



const activeMessag = () => {
    setInterval(async () => {
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

                    let docsPendientes;

                    if (workWithMock) {
                        docsPendientes = mockPendingDocuments(cliente.clientId);
                    } else {
                        docsPendientes = await apiService.getPendingDocuments(cliente.clientId);
                    }

                    const mensaje = buildDynamicPendingDocsMessage(
                        cliente,
                        companyName,
                        docsPendientes.documentList
                    );

                    let cleanNumber = cliente.number.replace(/\D/g, '');
                    if (cleanNumber.startsWith('54') && cleanNumber.length === 12) {
                        cleanNumber = '549' + cleanNumber.substring(2);
                    }
                    
                    if (withDummyNumberCris) {
                        cleanNumber = DUMMY_NUMBER_CRIS;
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

    }, 25000); // 10 * 60 * 1000 → 4 horas
};



const listenMessage = () => {
    client.on('message', async msg => {
        const { from, body } = msg;

        console.log("=== Nuevo mensaje ===");
        console.log("De:", from);
        console.log("Mensaje:", body);
        console.log(`[LOG] Modo: ${workWithMock ? 'MOCK' : 'API REAL'}`);

        // Ignorar grupos
        if (from.toString().length > 27) {
            console.log("[LOG] Es un grupo → no proceso nada");
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
                console.log("[DUMMY] DOCUMENTO VÁLIDO DIRECTAMENTE");
                client.sendMessage(from, "✔ Documento válido (Modo Dummy Cris). Procesado correctamente.");
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
                    client.sendMessage(from, "❌ La documentación es incorrecta. Motivo: ejemplo. Consejos: reenviá una foto más clara.");
                    return;
                }

                console.log("[MOCK] DOCUMENTO VÁLIDO");
                client.sendMessage(from, "✔ Documento válido. Procesado correctamente.");
                return;
            } else {
                // ============================================================
                // 🟢 MODO API REAL — descarga el media y envía a CelerPass
                // ============================================================
                try {
                    console.log("[API] Descargando archivo media...");
                    const media = await msg.downloadMedia();
                    const base64 = media.data;

                    // idDocument y clientId se obtendrían del estado de conversación;
                    // por ahora usamos los datos del cliente validado en Endpoint 1
                    const idDocument = null; // TODO: rastrear documento esperado por usuario
                    const clientId = clienteValidado?.clientId || null;

                    const resultado = await apiService.validateDocument(idDocument, clientId, base64);

                    if (!resultado.documentValid) {
                        const motivo = resultado.message || "Documento inválido";
                        const sugerencia = resultado.sugestion ? ` Sugerencia: ${resultado.sugestion}` : "";
                        client.sendMessage(from, `❌ ${motivo}.${sugerencia}`);
                        return;
                    }

                    client.sendMessage(from, `✔ ${resultado.message || 'Documento válido. Procesado correctamente.'}`);
                } catch (err) {
                    console.log("[ERROR] Fallo al validar documento via API:", err.message || err);
                    client.sendMessage(from, "⚠ Hubo un error al procesar tu documento. Intentá de nuevo.");
                }
                return;
            }
        }

        // Si llega texto
        console.log("[LOG] Usuario envió texto:", body);

        if (body === "1") {
            console.log("[LOG] Usuario eligió opción 1");
            client.sendMessage(from, "Enviame la foto del DNI ahora.");
            return;
        }

        if (body === "2") {
            console.log("[LOG] Usuario eligió opción 2");
            client.sendMessage(from, "Enviame la factura en PDF o foto.");
            return;
        }

    });
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
 * Revisamos si tenemos credenciales guardadas para inciar sessio
 * este paso evita volver a escanear el QRCODE
 */
const withSession = () => {
    // Si exsite cargamos el archivo con las credenciales
    const spinner = ora(`Cargando ${chalk.yellow('Validando session con Whatsapp...')}`);
    sessionData = require(SESSION_FILE_PATH);
    spinner.start();
    client = new Client({ puppeteer: { headless: true, args: ['--no-sandbox'] }, session: sessionData });

    client.on('ready', () => {
        console.log('Client is ready!');
        spinner.stop();
        otraSession = false;
        clientReady = true;
        connectionReady();
    });

    client.on('auth_failure', () => {
        spinner.stop();
        if (fs.existsSync(SESSION_FILE_PATH)) {
            fs.unlinkSync(SESSION_FILE_PATH)
            withOutSession()
        }
        console.log('** Error de autentificacion vuelve a generar el QRCODE (Borrar el archivo session.json) **');
    })

    client.initialize();
}

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {
    console.log('🔄 No tenemos sesión guardada, iniciando nueva...');

    otraSession = false;

    // RUTA CONSISTENTE DE SESIÓN
    const AUTH_DIR = './.wwebjs_auth';

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: "client",
            dataPath: AUTH_DIR
        }),

        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },

        puppeteer: {
            headless: true,
            // Si querés usar Chrome instalado, descomentá y ajustá la ruta:
            // executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-gpu',
                '--disable-features=IsolateOrigins,site-per-process',
                '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
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
        console.log("💥 Error en initialize:", err);
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
    res.send({ clientReady: clientReady, otraSession: otraSession }).end()
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
    qr.toDataURL(qrclient, (err, src) => {
        if (err) res.send("Error occured");
        res.send({ src: src, clientReady: clientReady, otraSession: otraSession })
    });
});

app.post('/send', sendMessagePost);

/**
 * Revisamos si existe archivo con credenciales!
 */
withOutSession();


app.listen(port, () => {
    console.log('Server ready!');
})