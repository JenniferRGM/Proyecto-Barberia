USE [master];
GO
CREATE LOGIN admin_barberia WITH PASSWORD = 'barberia90';
GO

USE Barberia;
GO
CREATE USER admin_barberia FOR LOGIN admin_barberia;
ALTER ROLE db_owner ADD MEMBER admin_barberia;
