-- MySQL dump 10.13  Distrib 8.4.13, for Linux (x86_64)
--
-- Host: localhost    Database: task4_don_hang_gia
-- ------------------------------------------------------
-- Server version	8.4.13

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

/* SET @@GLOBAL.GTID_PURGED='+9ba93ba5-d81d-11f1-b7cd-3dda8f3e8af7:1-26';*/

--
-- Position to start replication or point-in-time recovery from
--

-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='mysql-bin.000003', SOURCE_LOG_POS=11074;

--
-- Current Database: `task4_don_hang_gia`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `task4_don_hang_gia` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `task4_don_hang_gia`;

--
-- Table structure for table `auth_sessions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_sessions` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `expires_at` (`expires_at`),
  CONSTRAINT `auth_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_sessions`
--

/*!40000 ALTER TABLE `auth_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_sessions` ENABLE KEYS */;

--
-- Table structure for table `backup_records`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `backup_records` (
  `id` char(36) NOT NULL,
  `file_name` varchar(100) NOT NULL,
  `sha256` char(64) DEFAULT NULL,
  `size_bytes` bigint DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `user_id` char(36) DEFAULT NULL,
  `error_code` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `backup_records`
--

/*!40000 ALTER TABLE `backup_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `backup_records` ENABLE KEYS */;

--
-- Table structure for table `idempotency_keys`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `idempotency_keys` (
  `user_id` char(36) NOT NULL,
  `idem_key` varchar(100) NOT NULL,
  `request_hash` char(64) NOT NULL,
  `order_id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`idem_key`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `idempotency_keys_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `idempotency_keys_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `idempotency_keys`
--

/*!40000 ALTER TABLE `idempotency_keys` DISABLE KEYS */;
/*!40000 ALTER TABLE `idempotency_keys` ENABLE KEYS */;

--
-- Table structure for table `incident_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incident_logs` (
  `id` char(36) NOT NULL,
  `type` varchar(40) NOT NULL,
  `mode` enum('Demo','Live') NOT NULL,
  `severity` varchar(20) NOT NULL,
  `component` varchar(100) NOT NULL,
  `status` varchar(30) NOT NULL,
  `timeline` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `recovered_at` datetime(3) DEFAULT NULL,
  `user_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `incident_logs`
--

/*!40000 ALTER TABLE `incident_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `incident_logs` ENABLE KEYS */;

--
-- Table structure for table `notification_reads`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_reads` (
  `user_id` char(36) NOT NULL,
  `event_key` varchar(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`event_key`),
  KEY `user_id` (`user_id`,`read_at`),
  CONSTRAINT `notification_reads_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_reads`
--

/*!40000 ALTER TABLE `notification_reads` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_reads` ENABLE KEYS */;

--
-- Table structure for table `oauth_login_attempts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `oauth_login_attempts` (
  `id` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `oauth_login_attempts`
--

/*!40000 ALTER TABLE `oauth_login_attempts` DISABLE KEYS */;
/*!40000 ALTER TABLE `oauth_login_attempts` ENABLE KEYS */;

--
-- Table structure for table `order_status_history`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` char(36) NOT NULL,
  `old_status` varchar(20) DEFAULT NULL,
  `new_status` varchar(20) NOT NULL,
  `user_id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `order_id` (`order_id`,`created_at`),
  CONSTRAINT `order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `order_status_history_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_status_history`
--

/*!40000 ALTER TABLE `order_status_history` DISABLE KEYS */;
INSERT INTO `order_status_history` VALUES (1,'00000000-0000-4000-8000-000000000201',NULL,'Pending','00000000-0000-4000-8000-000000000001','2026-11-04 07:02:02.841'),(2,'00000000-0000-4000-8000-000000000202',NULL,'Pending','00000000-0000-4000-8000-000000000001','2026-11-04 07:02:02.841'),(3,'00000000-0000-4000-8000-000000000202','Pending','Completed','00000000-0000-4000-8000-000000000001','2026-11-04 07:02:02.841');
/*!40000 ALTER TABLE `order_status_history` ENABLE KEYS */;

--
-- Table structure for table `orders`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` char(36) NOT NULL,
  `customer_name` varchar(200) NOT NULL,
  `product_name` varchar(200) NOT NULL,
  `quantity` int NOT NULL,
  `total_amount` decimal(14,2) NOT NULL,
  `status` enum('Pending','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  `version` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `status` (`status`,`created_at`),
  KEY `created_at` (`created_at`),
  KEY `customer_name` (`customer_name`),
  CONSTRAINT `orders_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `orders_chk_2` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES ('00000000-0000-4000-8000-000000000201','Khách hàng giả A','Sản phẩm giả Á',1,120000.00,'Pending',1,'2026-11-04 07:02:02.837','2026-11-04 07:02:02.837'),('00000000-0000-4000-8000-000000000202','Khách hàng giả B','Sản phẩm giả Á',2,240000.00,'Completed',2,'2026-11-04 07:02:02.837','2026-11-04 07:02:02.837');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;

--
-- Table structure for table `products`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` char(36) NOT NULL,
  `sku` varchar(64) NOT NULL,
  `name` varchar(200) NOT NULL,
  `unit_price` decimal(14,2) NOT NULL,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `created_by` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `created_by` (`created_by`),
  KEY `name` (`name`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `products_chk_1` CHECK ((`unit_price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES ('00000000-0000-4000-8000-000000000101','TASK4-SP-01','Sản phẩm giả Á',120000.00,'Dữ liệu kiểm thử','00000000-0000-4000-8000-000000000001','2026-11-04 07:02:02.834');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;

--
-- Table structure for table `restore_records`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `restore_records` (
  `id` char(36) NOT NULL,
  `backup_id` char(36) NOT NULL,
  `target_database` varchar(100) NOT NULL,
  `status` varchar(30) NOT NULL,
  `report` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `user_id` char(36) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `restore_records`
--

/*!40000 ALTER TABLE `restore_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `restore_records` ENABLE KEYS */;

--
-- Table structure for table `schema_migrations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `version` varchar(100) NOT NULL,
  `applied_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('001_initial','2026-11-04 07:02:02.389'),('002_user_access','2026-11-04 07:02:02.534'),('003_notifications','2026-11-04 07:02:02.586');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;

--
-- Table structure for table `user_access_history`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_access_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` char(36) NOT NULL,
  `actor_id` char(36) NOT NULL,
  `before_access` json NOT NULL,
  `after_access` json NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `actor_id` (`actor_id`),
  KEY `user_id` (`user_id`,`created_at`),
  CONSTRAINT `user_access_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_access_history_ibfk_2` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_access_history`
--

/*!40000 ALTER TABLE `user_access_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_access_history` ENABLE KEYS */;

--
-- Table structure for table `users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` char(36) NOT NULL,
  `username` varchar(100) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `email` varchar(254) DEFAULT NULL,
  `full_name` varchar(120) DEFAULT NULL,
  `google_sub` varchar(255) DEFAULT NULL,
  `auth_provider` enum('Local','Google') NOT NULL DEFAULT 'Local',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `account_status` enum('Pending','Active','Rejected','Suspended') NOT NULL DEFAULT 'Active',
  `permissions` json DEFAULT NULL,
  `access_version` int NOT NULL DEFAULT '1',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `review_note` varchar(500) DEFAULT NULL,
  `role` enum('Admin','Staff') NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_sub` (`google_sub`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('00000000-0000-4000-8000-000000000001','task4_user_gia',NULL,NULL,NULL,NULL,'Local',0,'Active',NULL,1,NULL,NULL,NULL,'Staff','2026-11-04 07:02:02.830');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;

--
-- Dumping events for database 'task4_don_hang_gia'
--

--
-- Dumping routines for database 'task4_don_hang_gia'
--
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-04  7:02:16
