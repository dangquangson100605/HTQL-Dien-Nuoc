try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass

# Bypass MariaDB version check (XAMPP uses MariaDB 10.4.32, which is fully functional)
from django.db.backends.mysql.base import DatabaseWrapper
DatabaseWrapper.check_database_version_supported = lambda self: None

# Fix MariaDB < 10.5 RETURNING syntax error in Django 5.x/6.x
from django.db.backends.mysql.features import DatabaseFeatures
DatabaseFeatures.can_return_columns_from_insert = property(
    lambda self: self.connection.mysql_is_mariadb and self.connection.mysql_version >= (10, 5, 0)
)
