const { buildDynamicPendingDocsMessage } = require('../utils/messageBuilder');

describe('Message Builder Utils', () => {
    test('Debe construir correctamente el menú dinámico de documentos', () => {
        const cliente = { name: "Matias" };
        const companyName = "Coca-Cola";
        const documentList = [
            { nameDocument: "DNI", descripcionDocument: "Foto de frente" },
            { nameDocument: "Constancia", descripcionDocument: "AFIP" }
        ];

        const result = buildDynamicPendingDocsMessage(cliente, companyName, documentList);

        expect(result).toContain("Hola Matias! 👋");
        expect(result).toContain("Para tu próxima visita en *Coca-Cola*");
        expect(result).toContain("1) *DNI* — Foto de frente");
        expect(result).toContain("2) *Constancia* — AFIP");
        expect(result).toContain("Por favor enviá el número de la opción que quieras cargar.");
    });

    test('Debe manejar una lista vacía de documentos sin fallar', () => {
        const cliente = { name: "Test" };
        const companyName = "EmpresaX";
        const documentList = [];

        const result = buildDynamicPendingDocsMessage(cliente, companyName, documentList);

        expect(result).toContain("Hola Test!");
        expect(result).not.toContain("1) *");
    });
});
