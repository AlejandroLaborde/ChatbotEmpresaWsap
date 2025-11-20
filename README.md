
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

URL: htpp://www.{URL}.com/
Path:
Tipo: GET
Request:
{
    "nume": "value"
}
Response:
{
    "key": "value"
}

//------------------------------------

Endpoint 2:
¿Que hace?
- Personas con documentacion pendiente

URL: htpp://www.{URL}.com/
Path: /pending-clients
Tipo: GET
Request:
{
    
}
Response:
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
}

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
¿Que hace?
-Validar numero es usuario

URL: htpp://www.{URL}.com/
Path:
Tipo: POST
Request:
{
    "nume": "value"
}
Response:
{
    "key": "value"
}