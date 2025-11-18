/**
 * ⚡⚡⚡ DECLARAMOS LAS LIBRERIAS y CONSTANTES A USAR! ⚡⚡⚡
 */
const fs = require('fs');
const mimeDb = require('mime-db')
const express = require('express');
const moment = require('moment');
const ora = require('ora');
const chalk = require('chalk');
const ExcelJS = require('exceljs');
const qrcode = require('qrcode-terminal');
const qr = require('qrcode');
const { Client, MessageMedia,LocalAuth } = require('whatsapp-web.js');
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
 * Seattings
 */
app.set('appName', 'Chatbot persnalizado');
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
const sendMessage = (number = null, text = null) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`
    const message = text;
    client.sendMessage(number, message);
    try{
        readChatJson(number, message)
    }catch(error) {
        console.log("excel",error)
    }
    
    console.log(`${chalk.red('⚡⚡⚡ Enviando mensajes....')}`);
}

/**
 * Escuchamos cuando entre un mensaje
 */
const listenMessage = () => {
    client.on('message', async msg => {
        const { from, to, body } = msg;
        if (msg.hasMedia) {
            //Esto esta preparado para guardar las imagenes que lleguen
            //const media = await msg.downloadMedia();
            //saveMedia(media);
        } else {

            if (from.toString().length < 27) { // para validar que sea una persona y que no sea un grupo
                pathExcel = `./chats/${from}.json`;
                clientExist = fs.existsSync(pathExcel);
                if (clientExist) {
                   await readLastFileJsonAndResponse(from, body);
                } else {
                    await greetCustomer(from);
                    await replyAsk(from, body, clientExist);
                }
            } else {
                console.log("El mensaje que se recibio es proveniente de un grupo")
            }
        }
    });
}

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


    if(clientExist){
   
        if(flow.STEP_1.includes(answer.toLowerCase() )) {
            sendMessage(from, messages.INFORMACION.join(''));
            sendVolverMenu(from);
        }
        else if(flow.STEP_2.includes(answer.toLowerCase() )) {
            sendMessage(from, messages.ENCONTRARNOS.join(''));
            sendVolverMenu(from);
        }
        else if(flow.STEP_3.includes(answer.toLowerCase() )) {
            sendMessage(from, messages.CONTACTO.join(''));
            sendVolverMenu(from);
        }
        else if(flow.STEP_4.includes(answer.toLowerCase() )) {
            sendMessage(from, messages.MEDIDA.join(''));
            sendVolverMenu(from); 
        }
        
        else if(flow.STEP_0.includes(answer.toLowerCase() )) {
            sendMessage(from, messages.MENU.join(''));
        }
        else if(flow.STEP_9.includes(answer.toLowerCase() )) {
            sendMedia(from, "logo-vertical.png" );
            sendMessage(from, messages.SALUDO_FINAL.join(''));
        }
        else{
            message = ""
        }
    }
    
    return

})

function sendVolverMenu( from ){
   setTimeout(() => {
        log(from,"0",messages.VOLVER_MENU.join(''));
        sendMessage(from, messages.VOLVER_MENU.join(''));
    }, 2500); 
}

function log( from, answer , response ){
    console.log("# ", from, " # ", answer , " # ", response);
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

        puppeteer: {
            headless: false,
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

const connectionReady = () => {
    listenMessage();
    //readExcel();
    listenChanges();
}

const readChatJson = async (number, message) => {
    const pathJson = `./chats/${number}.json`;
    const today = moment().format('MM-DD-YYYY HH:mm ');

    try {
        if (fs.existsSync(pathJson)) {
            fs.writeFile(pathJson, JSON.stringify({fecha:today}), function (err) {
                if (err) {console.log(err);}
            });
        } else {
            fs.writeFile(pathJson,JSON.stringify({fecha:today}), function (err) {
                if (err) { console.log(err); }});
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
            console.log("Json Error",error)
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

        sendMessage(from,  messages.BIENVENIDA.join(''));
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
        res.render(__dirname + '/views/index', { titulo: app.get('appName'), 
                                                qrclient: qrclient, 
                                                clientReady: clientReady, 
                                                src: src, 
                                                otraSession : otraSession })
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
    withSession();
    res.send({ clientReady: clientReady, otraSession: otraSession }).end()
})

app.get('/desconectar', (req, res) => {
    client.destroy().then(resp=>{

    }).finally( ()=>{
        if (fs.existsSync(SESSION_FILE_PATH)) {
            fs.unlinkSync(SESSION_FILE_PATH);
            withOutSession()
        } else {
            client= null;
            withOutSession()
        }
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
(fs.existsSync(SESSION_FILE_PATH)) ? withSession() : withOutSession();


app.listen(port, () => {
    console.log('Server ready!');
})