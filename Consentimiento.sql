--Agregar el consentimiento en las tablas Clientes y Barberos
ALTER TABLE Clientes
ADD
    Consentimiento      BIT NOT NULL CONSTRAINT DF_Clientes_Consent DEFAULT 0,
    FechaConsentimiento DATETIME NULL;

ALTER TABLE Barberos
ADD
    Consentimiento      BIT NOT NULL CONSTRAINT DF_Barberos_Consent DEFAULT 0,
    FechaConsentimiento DATETIME NULL;

--Marcar clientes y barberos existentes como aceptado
UPDATE Clientes
SET Consentimiento = 1,
    FechaConsentimiento = GETDATE()
WHERE Consentimiento = 0;

UPDATE Clientes
SET Consentimiento = 1,
    FechaConsentimiento = GETDATE()
WHERE Consentimiento = 0;