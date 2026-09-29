#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  SELECT 'CREATE DATABASE linker_auth' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_auth')\gexec
  SELECT 'CREATE DATABASE linker_platform' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_platform')\gexec
  SELECT 'CREATE DATABASE linker_companies' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_companies')\gexec
  SELECT 'CREATE DATABASE linker_shops' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_shops')\gexec
  SELECT 'CREATE DATABASE linker_orders' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_orders')\gexec
  SELECT 'CREATE DATABASE linker_fulfillment' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_fulfillment')\gexec
  SELECT 'CREATE DATABASE linker_routing' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_routing')\gexec
  SELECT 'CREATE DATABASE linker_saga' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_saga')\gexec
  SELECT 'CREATE DATABASE linker_inventory' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_inventory')\gexec
  SELECT 'CREATE DATABASE linker_files' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_files')\gexec
  SELECT 'CREATE DATABASE linker_notifications' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_notifications')\gexec
  SELECT 'CREATE DATABASE linker_uploaders' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_uploaders')\gexec
  SELECT 'CREATE DATABASE linker_ecommerce_shopify' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_ecommerce_shopify')\gexec
  SELECT 'CREATE DATABASE linker_wms_modernwms' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_wms_modernwms')\gexec
  SELECT 'CREATE DATABASE linker_wms_sftp_edi' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'linker_wms_sftp_edi')\gexec
EOSQL
