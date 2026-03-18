
# BOT Whatsapp


Este bot fue realizado por CAM Technology.
[https://github.com/matias2806/ChatBotCAMTechnology](https://github.com/matias2806/ChatBotCAMTechnology)

#### Node 
> Debes de tener instalado NODE 

## Instruciones
__Descargar o Clonar repositorio__

__Instalar paquetes (npm install)__
> Ubicate en le directorio que descargaste y via consola o terminal ejecuta el siguiente comando

`npm install` 


__Ejecutar el script app.js__
> Ubicate en le directorio que descargaste y via consola o terminal ejecuta el siguiente comando `node app.js` .
Escanea el el código QR desde tu aplicación de Whatsapp

`node app.js`

---

## 🛡️ Funcionalidades y Modo Seguro (Dummy Mode)

Durante el desarrollo de integraciones con APIs reales, es vital no enviar mensajes por accidente a los clientes finales.
Para evitar esto, en `app.js` se encuentra instalada una bandera de seguridad:

```javascript
const withDummyNumberCris = true;
const DUMMY_NUMBER_CRIS = "5491158232588";
```

### ¿Cómo funciona el Modo Dummy = `true`?
- **Redirección de Envío:** Sin importar qué clientes y números arroje el Endpoint de CelerPass, el bot interceptará cada número y enviará **todos los mensajes** a tu número de prueba (`+54 9 11 5823-2588`).
- **Autovalidación:** Al responder o enviar fotos por WhatsApp, el bot salteará las llamadas a la API de validación real (Endpoints 1 y 4) y *"aprobará"* tus documentos instantáneamente en forma de simulacro para agilizar los seteos de pruebas.

### Otras Mejoras Internas
* **Multi-Empresa:** El bot es capaz de leer y separar listas nativas con formato *Array* de empresas (ej: `[{ companyName: 'A'... }, { companyName: 'B'... }]`).
* **Auto-Parseo de Celulares:** A los números móviles provenientes de Argentina (`+54`) que ingresan desde la API, se les inyecta automáticamente el dígito **`9`**  (`549...`) requerido estrictamente por las normas internas de WhatsApp.
* **Control de Existencia (Anti-Crash):** El bot efectúa una llamada a `client.getNumberId()` para cerciorarse de que un número tenga WhatsApp activo antes de enviarle un mensaje. Si no existe, simplemente lo reporta y lo saltea evitando que todo el servidor caiga.

---

Listado y formato de endpoints que necesitamos

1. Validar numero es usuario si un numero que me hablo es cliente?
2. Saber si tiene pendientes o no que endpoint es?
3. El caso de genera QR si no posee doc ustedes en el endpoint que enviarian?
Nosotros aca haremos un mock procesando eso que envieen y lo mostraremos en el mientras tanto.
4. a que endpoint tenemos que pegarle para conseguir el nombre de la empresa?
El dia de la visita?
a que endpoint tenemos que pegarle para conseguir el listado de docs?
El mensaje de solicitud de documentacion viene por algun endpoint?
Usa file o base64 para guardado de doc?

//------------------------------------

Endpoint X:

URL: htpp://www.{URL}.com/
Path:
Tipo:
Request:
{
    "key": "value"
}
Response:
{
    "key": "value"
}

//------------------------------------

Endpoint 1:
¿Que hace?
-Validar numero es usuario
Verificar con cliente escenarios:
-Habla persona random 
-Habla persona con documentacion 
-Habla persona sin documentacion 

URL: htpp://www.{URL}.com/
Path:
Tipo: GET
Request:
{
    "number": "value"
}
Response:
{
    "clientId": "value",
    "isClient": "Bool",
    "message": ""
}

//------------------------------------

Endpoint 2:
¿Que hace?
- Personas con documentacion pendiente
Definir unidad de tiempo para este chequeo
URL: htpp://www.{URL}.com/
Path: /pending-clients
Tipo: GET
Request:
{
    
}
Response:
[
    {
        "companyName": "Coca-Cola",
        "list": [
            {
                "clientId": "UUID", o String o UUID
                "name": "Matias",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            },
            {
                "clientId": "UUID", o String o UUID
                "name": "Alejandro",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            },
            {
                "clientId": "UUID", o String o UUID
                "name": "Cris",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            }
        ]
    },
    {
        "companyName": "Fernet Branca",
        "list": [
            {
                "clientId": "UUID", o String o UUID
                "name": "Matias",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            },
            {
                "clientId": "UUID", o String o UUID
                "name": "Alejandro",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            },
            {
                "clientId": "UUID", o String o UUID
                "name": "Cris",
                "number": "541112345678",
                "direc": "direcion tal",STRING
                "hourAndDate": "12:00 12/12/2025",String
            }
        ]
    }
]


//------------------------------------

Endpoint 3:
¿Que hace?
Consigue el listado de documentaciones pendientes de una persona

URL: htpp://www.{URL}.com/
Path: /pending-documents
Tipo: GET
Request:
{
    "clientId": "UUID", o String o UUID
}
Response:
{
    "documentList": [
        {
            "nameDocument": "Pirulo",
            "descripcionDocument": "xxxx",
            "idDocument": "id o UUID"
        },
        {
            "nameDocument": "Pirulo",
            "descripcionDocument": "xxxx",
            "idDocument": "id o UUID"
        },
        {
            "nameDocument": "Pirulo",
            "descripcionDocument": "xxxx",
            "idDocument": "id o UUID"
        }
    ]
}

//------------------------------------

Endpoint 4:
-Validar del documento enviado

URL: htpp://www.{URL}.com/
Path: /validate-document
Tipo: POST
Request:
{
    "idDocument": "value",
    "clientId":"value",
    "base64":"value"
}
Response:
{
    "documentValid": "bool",
    "message":"value",
    "sugestion":"value" //Solo se envia si documentValid es False
}


//------------------------------------

Endpoint 5:
-Generar QR Acceso Cliente

URL: htpp://www.{URL}.com/
Path: /get-QR
Tipo: GET
Request:
{
    "clientId":"value"
}
Response:
{
    "base64": "value"
}
