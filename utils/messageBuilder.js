/**
 * Construye el mensaje dinámico de documentación pendiente para un cliente.
 * 
 * @param {Object} cliente - Información del cliente.
 * @param {string} companyName - Nombre de la empresa.
 * @param {Array} documentList - Lista de documentos pendientes.
 * @returns {string} Mensaje formateado.
 */
const buildDynamicPendingDocsMessage = (cliente, companyName, documentList) => {
    let mensaje = `Hola ${cliente.name}! 👋\n`;
    mensaje += `Para tu próxima visita en *${companyName}* necesitamos la siguiente documentación:\n\n`;

    documentList.forEach((doc, index) => {
        mensaje += `${index + 1}) *${doc.nameDocument}* — ${doc.descripcionDocument}\n`;
    });

    mensaje += `\nPor favor enviá el número de la opción que quieras cargar.`;

    return mensaje;
};

module.exports = {
    buildDynamicPendingDocsMessage
};
