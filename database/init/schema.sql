CREATE TABLE users (
 id CHAR(36) PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NULL,
 email VARCHAR(254) NULL UNIQUE, full_name VARCHAR(120) NULL, google_sub VARCHAR(255) NULL UNIQUE,
 auth_provider ENUM('Local','Google') NOT NULL DEFAULT 'Local', email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 account_status ENUM('Pending','Active','Rejected','Suspended') NOT NULL DEFAULT 'Active', permissions JSON NULL,
 access_version INT NOT NULL DEFAULT 1, reviewed_by CHAR(36) NULL, reviewed_at DATETIME(3) NULL, review_note VARCHAR(500) NULL,
 role ENUM('Admin','Staff') NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE auth_sessions (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, expires_at DATETIME NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id), INDEX(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE orders (
 id CHAR(36) PRIMARY KEY, customer_name VARCHAR(200) NOT NULL, product_name VARCHAR(200) NOT NULL,
 quantity INT NOT NULL CHECK(quantity>0), total_amount DECIMAL(14,2) NOT NULL CHECK(total_amount>=0),
 status ENUM('Pending','Completed','Cancelled') NOT NULL DEFAULT 'Pending', version INT NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX(status,created_at), INDEX(created_at), INDEX(customer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE order_status_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id CHAR(36) NOT NULL, old_status VARCHAR(20), new_status VARCHAR(20) NOT NULL,
 user_id CHAR(36) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(user_id) REFERENCES users(id), INDEX(order_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE idempotency_keys (
 user_id CHAR(36) NOT NULL, idem_key VARCHAR(100) NOT NULL, request_hash CHAR(64) NOT NULL, order_id CHAR(36) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(user_id,idem_key),
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE incident_logs (
 id CHAR(36) PRIMARY KEY, type VARCHAR(40) NOT NULL, mode ENUM('Demo','Live') NOT NULL,
 severity VARCHAR(20) NOT NULL, component VARCHAR(100) NOT NULL, status VARCHAR(30) NOT NULL,
 timeline JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), recovered_at DATETIME(3), user_id CHAR(36), INDEX(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE backup_records (
 id CHAR(36) PRIMARY KEY, file_name VARCHAR(100) NOT NULL, sha256 CHAR(64), size_bytes BIGINT,
 status VARCHAR(20) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), user_id CHAR(36), error_code VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE restore_records (
 id CHAR(36) PRIMARY KEY, backup_id CHAR(36) NOT NULL, target_database VARCHAR(100) NOT NULL,
 status VARCHAR(30) NOT NULL, report JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), user_id CHAR(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB;
INSERT INTO schema_migrations(version) VALUES ('001_initial');

CREATE TABLE user_access_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 before_access JSON NOT NULL, after_access JSON NOT NULL, note VARCHAR(500), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(actor_id) REFERENCES users(id), INDEX(user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE oauth_login_attempts (
 id CHAR(64) PRIMARY KEY, expires_at DATETIME NOT NULL, consumed BOOLEAN NOT NULL DEFAULT FALSE, INDEX(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE products (
 id CHAR(36) PRIMARY KEY, sku VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(200) NOT NULL,
 unit_price DECIMAL(14,2) NOT NULL CHECK(unit_price>=0), description VARCHAR(1000) NOT NULL DEFAULT '',
 created_by CHAR(36) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(created_by) REFERENCES users(id), INDEX(name), INDEX(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations(version) VALUES ('002_user_access');
