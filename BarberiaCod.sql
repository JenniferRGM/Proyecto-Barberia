CREATE DATABASE Barberia;
GO

USE Barberia;
GO

-- Tabla: Clientes
CREATE TABLE Clientes (
    ClienteID VARCHAR(15) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL,
    Apellido1 VARCHAR(30) NOT NULL,
    Apellido2 VARCHAR(30) NOT NULL,
    Telefono VARCHAR(15) NOT NULL,
    CorreoElectronico VARCHAR(320) NOT NULL,
    FechaNacimiento DATE NOT NULL,
    FechaRegistro DATE NOT NULL,
    Direccion VARCHAR(100) NOT NULL,
    Estado CHAR(1) NOT NULL CHECK (Estado IN ('A', 'I')),
    FechaCreacion DATETIME DEFAULT GETDATE(),
    UsuarioRegistro VARCHAR(50)
);

-- Tabla: Barberos
CREATE TABLE Barberos (
    BarberoID VARCHAR(15) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL,
    Apellido1 VARCHAR(30) NOT NULL,
    Apellido2 VARCHAR(30) NOT NULL,
    Telefono VARCHAR(15) NOT NULL,
    CorreoElectronico VARCHAR(320) NOT NULL,
    FechaNacimiento DATE NOT NULL,
    FechaContratacion DATE NOT NULL,
    Estado CHAR(1) NOT NULL CHECK (Estado IN ('A', 'I')),
    FechaCreacion DATETIME DEFAULT GETDATE(),
    UsuarioRegistro VARCHAR(50)
);

-- Tabla: Servicios
CREATE TABLE Servicios (
    ServicioID VARCHAR(10) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL,
    Descripcion VARCHAR(100) NOT NULL,
    Precio DECIMAL(10, 2) NOT NULL,
    DuracionMinutos INT NOT NULL
);

-- Tabla: Citas
CREATE TABLE Citas (
    CitaID VARCHAR(10) PRIMARY KEY,         
    ClienteID VARCHAR(15) NOT NULL,
    BarberoID VARCHAR(15) NOT NULL,
    ServicioID VARCHAR(10) NOT NULL,
    Fecha DATE NOT NULL,
    HoraInicio TIME NOT NULL,
    HoraFin TIME NOT NULL,
    Estado CHAR(1) NOT NULL 
        CHECK (Estado IN ('P', 'C', 'R')),  -- P=Pendiente, C=Cancelada, R=Realizada
    Notas VARCHAR(200),
    UsuarioRegistro VARCHAR(50) NOT NULL,   -- Quién registró la cita
    FechaRegistro DATETIME NOT NULL DEFAULT GETDATE(), -- Cuándo se registró
    CONSTRAINT CK_Citas_Horas CHECK (HoraInicio < HoraFin),

    FOREIGN KEY (ClienteID) REFERENCES Clientes(ClienteID),
    FOREIGN KEY (BarberoID) REFERENCES Barberos(BarberoID),
    FOREIGN KEY (ServicioID) REFERENCES Servicios(ServicioID)
);

-- Tabla: Especialidades
CREATE TABLE Especialidades (
    EspecialidadID INT IDENTITY(1,1) PRIMARY KEY,
    Codigo AS ('ESP' + RIGHT('000' + CAST(EspecialidadID AS VARCHAR), 3)) PERSISTED,
    Nombre VARCHAR(50) NOT NULL
);

-- Tabla intermedia: Barbero-Especialidad
CREATE TABLE EspecialidadesBarbero (
    BarberoID VARCHAR(15),
    EspecialidadID INT,
    PRIMARY KEY (BarberoID, EspecialidadID),
    FOREIGN KEY (BarberoID) REFERENCES Barberos(BarberoID),
    FOREIGN KEY (EspecialidadID) REFERENCES Especialidades(EspecialidadID)
);

-- Tabla: Usuarios
CREATE TABLE Usuarios (
    UsuarioID VARCHAR(10) PRIMARY KEY,
    BarberoID VARCHAR(15) NULL,
    NombreUsuario VARCHAR(50) NOT NULL,
    Contrasena VARBINARY(64) NOT NULL,
    Rol VARCHAR(20) NOT NULL,
    FechaCreacion DATE NOT NULL,
    UltimoAcceso DATETIME NOT NULL,
    CorreoElectronico VARCHAR(320),
    FOREIGN KEY (BarberoID) REFERENCES Barberos(BarberoID)
);

-- Tabla: Ventas
CREATE TABLE Ventas (
    VentaID VARCHAR(10) PRIMARY KEY,
    ClienteID VARCHAR(15) NOT NULL,
    MontoTotal DECIMAL(10, 2) NOT NULL,
    FechaVenta DATE NOT NULL,
    FOREIGN KEY (ClienteID) REFERENCES Clientes(ClienteID)
);

-- Tabla: DetalleVentas
CREATE TABLE DetalleVentas (
    DetalleID VARCHAR(10) PRIMARY KEY,
    VentaID VARCHAR(10) NOT NULL,
    ServicioID VARCHAR(10) NULL,
    ProductoID VARCHAR(10) NULL,
    Cantidad INT NOT NULL,
    PrecioUnitario DECIMAL(10, 2) NOT NULL,
    Subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (VentaID) REFERENCES Ventas(VentaID),
    FOREIGN KEY (ServicioID) REFERENCES Servicios(ServicioID)
);

-- Tabla: InventarioProductos
CREATE TABLE InventarioProductos (
    ProductoID VARCHAR(10) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL,
    Marca VARCHAR(30) NOT NULL,
    Descripcion VARCHAR(100) NOT NULL,
    PrecioVenta DECIMAL(10, 2) NOT NULL,
    Costo DECIMAL(10, 2) NOT NULL,
    StockActual INT NOT NULL,
    StockMinimo INT NOT NULL,
    FechaEntrada DATE NOT NULL,
    FechaSalida DATE NULL
);

-- Tabla: Pagos
CREATE TABLE Pagos (
    PagoID VARCHAR(10) PRIMARY KEY,
    VentaID VARCHAR(10) NOT NULL,
    Monto DECIMAL(10, 2) NOT NULL,
    MetodoPago VARCHAR(50) NOT NULL,
    FechaPago DATE NOT NULL,
    FOREIGN KEY (VentaID) REFERENCES Ventas(VentaID)
);
-- Tabla: Bitacora
CREATE TABLE BitacoraAcciones (
    BitacoraID INT IDENTITY(1,1) PRIMARY KEY,
    TablaAfectada VARCHAR(50),
    TipoAccion VARCHAR(10),
    Usuario VARCHAR(50),
    FechaAccion DATETIME DEFAULT GETDATE(),
    Descripcion VARCHAR(500)
);

INSERT INTO Usuarios (
    UsuarioID, BarberoID, NombreUsuario, Contrasena, Rol, FechaCreacion, UltimoAcceso, CorreoElectronico
)
VALUES (
    'USU001', NULL, 'admin', CONVERT(VARBINARY(64), '$2b$10$gddhGSGPnDF4RpWv9NZyzOeQmzttO8QjjXaUcuzT2TTUq6EjD5bdG'),
    'Admin', GETDATE(), GETDATE(), 'admin@correo.com'
);

--Triggers para Barbero
CREATE TRIGGER trg_InsertBarbero
ON Barberos
AFTER INSERT
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT
        'Barberos',
        'INSERT',
        i.UsuarioRegistro,
        GETDATE(),
        CONCAT('Se agregó el barbero ', i.Nombre, ' ', i.Apellido1, ' ', i.Apellido2, ' con ID ', i.BarberoID)
    FROM inserted i;
END;

CREATE TRIGGER trg_UpdateBarbero
ON Barberos
AFTER UPDATE
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT
        'Barberos',
        'UPDATE',
        i.UsuarioRegistro,
        GETDATE(),
        CONCAT('Se actualizó el barbero ', i.Nombre, ' ', i.Apellido1, ' ', i.Apellido2, ' con ID ', i.BarberoID)
    FROM inserted i;
END;

CREATE TRIGGER trg_DeleteBarbero
ON Barberos
AFTER DELETE
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT
        'Barberos',
        'DELETE',
        d.UsuarioRegistro,
        GETDATE(),
        CONCAT('Se eliminó el barbero ', d.Nombre, ' ', d.Apellido1, ' ', d.Apellido2, ' con ID ', d.BarberoID)
    FROM deleted d;
END;

--Vistas Barbero
CREATE VIEW Vista_BarberosActivos AS
SELECT 
    BarberoID,
    Nombre,
    Apellido1,
    Apellido2,
    Telefono,
    CorreoElectronico,
    FechaNacimiento,
    FechaContratacion,
    Estado,
    FechaCreacion,
    UsuarioRegistro
FROM Barberos
WHERE Estado = 'A';

--trigger clientes
CREATE TRIGGER trg_InsertCliente
ON Clientes
AFTER INSERT
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT
        'Clientes',
        'INSERT',
        i.UsuarioRegistro,
        GETDATE(),
        CONCAT('Se registró el cliente ', i.Nombre, ' ', i.Apellido1, ' ', i.Apellido2, ' con ID ', i.ClienteID)
    FROM inserted i;
END;

CREATE TRIGGER trg_UpdateCliente
ON Clientes
AFTER UPDATE
AS
BEGIN
  INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
  SELECT
    'Clientes',
    'UPDATE',
    i.UsuarioRegistro,
    GETDATE(),
    CONCAT(
      'Se actualizó el cliente ',
      i.Nombre, ' ', i.Apellido1, ' ', i.Apellido2,
      ' con ID ', i.ClienteID
    )
  FROM inserted i;
END;

CREATE TRIGGER trg_DeleteCliente
ON Clientes
AFTER DELETE
AS
BEGIN
  INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
  SELECT
    'Clientes',
    'DELETE',
    d.UsuarioRegistro,
    GETDATE(),
    CONCAT(
      'Se eliminó el cliente ',
      d.Nombre, ' ', d.Apellido1, ' ', d.Apellido2,
      ' con ID ', d.ClienteID
    )
  FROM deleted d;
END;

--Vista clientes
CREATE VIEW VistaClientesActivos AS
SELECT 
  ClienteID,
  Nombre,
  Apellido1,
  Apellido2,
  CorreoElectronico,
  Telefono,
  Direccion,
  CONVERT(varchar, FechaNacimiento, 103) AS FechaNacimiento,  -- dd/mm/yyyy
  Estado,
  CASE Estado
    WHEN 'A' THEN 'Activo'
    WHEN 'I' THEN 'Inactivo'
  END AS EstadoDescripcion,
  FechaRegistro,
  UsuarioRegistro
FROM Clientes
WHERE Estado = 'A';

--Triggers de Servicios
CREATE TRIGGER trg_InsertServicio
ON Servicios
AFTER INSERT
AS
BEGIN
  INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
  SELECT 
    'Servicios',
    'INSERT',
    'admin', 
    GETDATE(),
    CONCAT('Se registró el servicio "', i.Nombre, '" con ID ', i.ServicioID)
  FROM inserted i;
END;

CREATE TRIGGER trg_UpdateServicio
ON Servicios
AFTER UPDATE
AS
BEGIN
  INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
  SELECT 
    'Servicios',
    'UPDATE',
    'admin',
    GETDATE(),
    CONCAT('Se actualizó el servicio "', i.Nombre, '" con ID ', i.ServicioID)
  FROM inserted i;
END;

--Triggers Citas

--Check para validar horas

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints 
  WHERE name = 'CK_Citas_Horas' AND parent_object_id = OBJECT_ID('dbo.Citas')
)
ALTER TABLE dbo.Citas
  ADD CONSTRAINT CK_Citas_Horas CHECK (HoraInicio < HoraFin);

  --validaciones y listados
  IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_Citas_Barbero_Fecha' AND object_id = OBJECT_ID('dbo.Citas')
)
CREATE INDEX IX_Citas_Barbero_Fecha ON dbo.Citas(BarberoID, Fecha, HoraInicio, HoraFin);

--Trigger Insert

CREATE TRIGGER trg_InsertCita
ON Citas
AFTER INSERT
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT 
        'Citas',
        'INSERT',
        i.UsuarioRegistro,
        GETDATE(),
        CONCAT(
            'Se registró la cita ', i.CitaID,
            ' para el cliente ', i.ClienteID,
            ' con el barbero ', i.BarberoID,
            ' y servicio ', i.ServicioID,
            ' el día ', CONVERT(VARCHAR, i.Fecha, 103),
            ' de ', CONVERT(VARCHAR(5), i.HoraInicio, 108),
            ' a ', CONVERT(VARCHAR(5), i.HoraFin, 108)
        )
    FROM inserted i;
END;
GO

--Trigger update
CREATE TRIGGER trg_UpdateCita
ON Citas
AFTER UPDATE
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT 
        'Citas',
        'UPDATE',
        i.UsuarioRegistro,
        GETDATE(),
        CONCAT(
            'Se actualizó la cita ', i.CitaID,
            ' para el cliente ', i.ClienteID,
            ' con el barbero ', i.BarberoID,
            ' y servicio ', i.ServicioID,
            ' el día ', CONVERT(VARCHAR, i.Fecha, 103),
            ' de ', CONVERT(VARCHAR(5), i.HoraInicio, 108),
            ' a ', CONVERT(VARCHAR(5), i.HoraFin, 108)
        )
    FROM inserted i;
END;
GO

--Trigger Delete

CREATE TRIGGER trg_DeleteCita
ON Citas
AFTER DELETE
AS
BEGIN
    INSERT INTO BitacoraAcciones (TablaAfectada, TipoAccion, Usuario, FechaAccion, Descripcion)
    SELECT 
        'Citas',
        'DELETE',
        d.UsuarioRegistro,
        GETDATE(),
        CONCAT(
            'Se eliminó la cita ', d.CitaID,
            ' del cliente ', d.ClienteID,
            ' con el barbero ', d.BarberoID,
            ' y servicio ', d.ServicioID,
            ' que estaba programada para el ', CONVERT(VARCHAR, d.Fecha, 103),
            ' de ', CONVERT(VARCHAR(5), d.HoraInicio, 108),
            ' a ', CONVERT(VARCHAR(5), d.HoraFin, 108)
        )
    FROM deleted d;
END;
GO

INSERT INTO Especialidades (Nombre)
VALUES
('Corte clásico'),
('Afeitado'),
('Coloración'),
('Diseños en barba'),
('Corte moderno');

SELECT eb.BarberoID, eb.EspecialidadID, e.Codigo, e.Nombre
FROM EspecialidadesBarbero eb
JOIN Especialidades e ON eb.EspecialidadID = e.EspecialidadID
WHERE eb.BarberoID = 'BAR001';

--Aumento en la descripcion de servicio
ALTER TABLE Servicios
ALTER COLUMN Descripcion VARCHAR(MAX);

--Agregar Imagenes en Servicios
ALTER TABLE Servicios
ADD Imagen VARCHAR(255) NULL;

--pueda tener solo servicio o solo producto
ALTER TABLE DetalleVentas ADD CONSTRAINT CK_DetalleVentas_Tipo
CHECK (
  (ServicioID IS NOT NULL AND ProductoID IS NULL) OR
  (ServicioID IS NULL AND ProductoID IS NOT NULL)
);

--imagenes para productos
ALTER TABLE InventarioProductos ADD Imagen VARCHAR(255) NULL;

--	Vista VentasDetalle
CREATE OR ALTER VIEW dbo.vw_VentasDetalle
AS
SELECT
  v.VentaID,
  v.FechaVenta,
  v.ClienteID,
  (c.Nombre + ' ' + c.Apellido1) AS Cliente,
  d.DetalleID,
  d.ServicioID,
  s.Nombre  AS ServicioNombre,
  d.ProductoID,
  p.Nombre  AS ProductoNombre,
  d.Cantidad,
  d.PrecioUnitario,
  d.Subtotal
FROM Ventas v
JOIN DetalleVentas d      ON d.VentaID = v.VentaID
LEFT JOIN Servicios s     ON s.ServicioID = d.ServicioID
LEFT JOIN InventarioProductos p ON p.ProductoID = d.ProductoID
LEFT JOIN Clientes c      ON c.ClienteID = v.ClienteID;
GO

--CRUD Productos
CREATE OR ALTER PROCEDURE dbo.sp_CRUD_InventarioProductos
  @Accion       CHAR(1),           -- 'C','R','U','D'
  @ProductoID   VARCHAR(10) = NULL,
  @Nombre       VARCHAR(50) = NULL,
  @Marca        VARCHAR(30) = NULL,
  @Descripcion  VARCHAR(100)= NULL,
  @PrecioVenta  DECIMAL(10,2)= NULL,
  @Costo        DECIMAL(10,2)= NULL,
  @StockActual  INT = NULL,
  @StockMinimo  INT = NULL,
  @FechaEntrada DATE = NULL,
  @FechaSalida  DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Accion='C'
  BEGIN
    INSERT INTO InventarioProductos
      (ProductoID, Nombre, Marca, Descripcion, PrecioVenta, Costo, StockActual, StockMinimo, FechaEntrada, FechaSalida)
    VALUES
      (@ProductoID,@Nombre,@Marca,@Descripcion,@PrecioVenta,@Costo,@StockActual,@StockMinimo,ISNULL(@FechaEntrada,GETDATE()),@FechaSalida);
    RETURN;
  END

  IF @Accion='R'
  BEGIN
    SELECT * FROM InventarioProductos WHERE ProductoID = @ProductoID;
    RETURN;
  END

  IF @Accion='U'
  BEGIN
    UPDATE InventarioProductos
       SET Nombre=@Nombre, Marca=@Marca, Descripcion=@Descripcion,
           PrecioVenta=@PrecioVenta, Costo=@Costo,
           StockActual=@StockActual, StockMinimo=@StockMinimo,
           FechaEntrada=ISNULL(@FechaEntrada, FechaEntrada),
           FechaSalida=@FechaSalida
     WHERE ProductoID=@ProductoID;
    RETURN;
  END

  IF @Accion='D'
  BEGIN
    DELETE FROM InventarioProductos WHERE ProductoID=@ProductoID;
    RETURN;
  END
END
GO


-- 1) Renombrar la tabla a dbo.Bitacora (si aún se llama BitacoraAcciones)
IF OBJECT_ID('dbo.BitacoraAcciones', 'U') IS NOT NULL
BEGIN
  EXEC sp_rename 'dbo.BitacoraAcciones', 'Bitacora';
END
GO

-- 2) Renombrar columnas si están con los nombres viejos
IF COL_LENGTH('dbo.Bitacora','TablaAfectada') IS NOT NULL
  EXEC sp_rename 'dbo.Bitacora.TablaAfectada', 'Tabla', 'COLUMN';
IF COL_LENGTH('dbo.Bitacora','TipoAccion') IS NOT NULL
  EXEC sp_rename 'dbo.Bitacora.TipoAccion', 'Accion', 'COLUMN';
IF COL_LENGTH('dbo.Bitacora','FechaAccion') IS NOT NULL
  EXEC sp_rename 'dbo.Bitacora.FechaAccion', 'Fecha', 'COLUMN';
IF COL_LENGTH('dbo.Bitacora','Descripcion') IS NOT NULL
  EXEC sp_rename 'dbo.Bitacora.Descripcion', 'Detalle', 'COLUMN';
GO

-- 3) Ajustar tipos/tamaños y defaults
-- 3.1  Tabla y Accion
IF COL_LENGTH('dbo.Bitacora','Tabla') IS NOT NULL
  ALTER TABLE dbo.Bitacora ALTER COLUMN Tabla  VARCHAR(128) NOT NULL;
IF COL_LENGTH('dbo.Bitacora','Accion') IS NOT NULL
  ALTER TABLE dbo.Bitacora ALTER COLUMN Accion VARCHAR(10)  NOT NULL;

-- 3.2  Detalle: ampliar a NVARCHAR(MAX)
IF COL_LENGTH('dbo.Bitacora','Detalle') IS NOT NULL
  ALTER TABLE dbo.Bitacora ALTER COLUMN Detalle NVARCHAR(MAX) NULL;

-- 3.3  Fecha: pasar a DATETIME2 y default SYSDATETIME()
DECLARE @df  sysname,
        @sql nvarchar(max);

-- nombre del default constraint de la columna Fecha (si existe)
SELECT @df = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c
  ON c.object_id = dc.parent_object_id
 AND c.column_id = dc.parent_column_id
JOIN sys.objects o
  ON o.object_id = c.object_id
WHERE o.name = N'Bitacora'
  AND c.name = N'Fecha';

-- quitar default constraint actual
IF @df IS NOT NULL
BEGIN
  SET @sql = N'ALTER TABLE dbo.Bitacora DROP CONSTRAINT ' + QUOTENAME(@df) + N';';
  EXEC sys.sp_executesql @sql;
END;

-- cambiar tipo a DATETIME2 NOT NULL
IF COL_LENGTH('dbo.Bitacora','Fecha') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Bitacora
    ALTER COLUMN Fecha DATETIME2 NOT NULL;
END;

-- volver a crear default a SYSDATETIME() si no hay ninguno
IF NOT EXISTS (
  SELECT 1
  FROM sys.default_constraints dc
  JOIN sys.columns c
    ON c.object_id = dc.parent_object_id
   AND c.column_id = dc.parent_column_id
  JOIN sys.objects o
    ON o.object_id = c.object_id
  WHERE o.name = N'Bitacora' AND c.name = N'Fecha'
)
BEGIN
  ALTER TABLE dbo.Bitacora
    ADD CONSTRAINT DF_Bitacora_Fecha
    DEFAULT SYSDATETIME() FOR Fecha;
END;


-- 4) Agregar columna Llave si no existe
IF COL_LENGTH('dbo.Bitacora','Llave') IS NULL
  ALTER TABLE dbo.Bitacora ADD Llave VARCHAR(64) NULL;
GO

-- 5) Agregar CHECK de acción si no existe
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Bitacora_Accion')
  ALTER TABLE dbo.Bitacora WITH NOCHECK
    ADD CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN ('INSERT','UPDATE','DELETE'));
GO

--Triggers Citas
-- INSERT
CREATE OR ALTER TRIGGER dbo.trg_Citas_Insert ON dbo.Citas
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.Bitacora (Fecha, Tabla, Accion, Llave, Usuario, Detalle)
  SELECT SYSDATETIME(), 'Citas', 'INSERT',
         i.CitaID,
         CAST(SESSION_CONTEXT(N'UsuarioApp') AS VARCHAR(50)),
         (SELECT i.CitaID, i.ClienteID, i.BarberoID, i.ServicioID, i.Fecha, i.HoraInicio, i.HoraFin, i.Estado
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i;
END
GO

-- UPDATE
CREATE OR ALTER TRIGGER dbo.trg_Citas_Update ON dbo.Citas
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.Bitacora (Fecha, Tabla, Accion, Llave, Usuario, Detalle)
  SELECT SYSDATETIME(), 'Citas', 'UPDATE',
         i.CitaID,
         CAST(SESSION_CONTEXT(N'UsuarioApp') AS VARCHAR(50)),
         (SELECT
            (SELECT d.CitaID, d.ClienteID, d.BarberoID, d.ServicioID, d.Fecha, d.HoraInicio, d.HoraFin, d.Estado
               FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS Antes,
            (SELECT i.CitaID, i.ClienteID, i.BarberoID, i.ServicioID, i.Fecha, i.HoraInicio, i.HoraFin, i.Estado
               FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS Despues
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i
  JOIN deleted  d ON d.CitaID = i.CitaID;
END
GO

-- DELETE
CREATE OR ALTER TRIGGER dbo.trg_Citas_Delete ON dbo.Citas
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.Bitacora (Fecha, Tabla, Accion, Llave, Usuario, Detalle)
  SELECT SYSDATETIME(), 'Citas', 'DELETE',
         d.CitaID,
         CAST(SESSION_CONTEXT(N'UsuarioApp') AS VARCHAR(50)),
         (SELECT d.CitaID, d.ClienteID, d.BarberoID, d.ServicioID, d.Fecha, d.HoraInicio, d.HoraFin, d.Estado
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM deleted d;
END
GO

CREATE UNIQUE INDEX UX_Usuarios_NombreUsuario ON Usuarios(NombreUsuario);

-- 1) Asegura la tabla nueva (por si aún no existe)
IF OBJECT_ID('dbo.Bitacora','U') IS NULL
BEGIN
  CREATE TABLE dbo.Bitacora(
    BitacoraID INT IDENTITY(1,1) PRIMARY KEY,
    Fecha      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Tabla      VARCHAR(50) NOT NULL,
    Accion     VARCHAR(10) NOT NULL,      -- 'INSERT'/'UPDATE'/'DELETE'
    Llave      VARCHAR(50)  NULL,         -- ID afectado
    Usuario    VARCHAR(50) NOT NULL DEFAULT SUSER_SNAME(),
    Detalle    VARCHAR(500) NULL
  );
END
GO

-- 2) Vista de compatibilidad para triggers viejos
IF OBJECT_ID('dbo.BitacoraAcciones','V') IS NOT NULL
  DROP VIEW dbo.BitacoraAcciones;
GO
CREATE VIEW dbo.BitacoraAcciones
AS
SELECT
  BitacoraID,
  Tabla      AS TablaAfectada,
  Accion     AS TipoAccion,
  Usuario,
  Fecha      AS FechaAccion,
  Detalle    AS Descripcion,
  Llave
FROM dbo.Bitacora;
GO
