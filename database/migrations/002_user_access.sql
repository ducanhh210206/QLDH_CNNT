-- Additive migration. Use npm run db:migrate; runner creates a safety snapshot first.
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN email VARCHAR(254) NULL UNIQUE;
ALTER TABLE users ADD COLUMN full_name VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL UNIQUE;
ALTER TABLE users ADD COLUMN auth_provider ENUM('Local','Google') NOT NULL DEFAULT 'Local';
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN account_status ENUM('Pending','Active','Rejected','Suspended') NOT NULL DEFAULT 'Active';
ALTER TABLE users ADD COLUMN permissions JSON NULL;
ALTER TABLE users ADD COLUMN access_version INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN reviewed_by CHAR(36) NULL;
ALTER TABLE users ADD COLUMN reviewed_at DATETIME(3) NULL;
ALTER TABLE users ADD COLUMN review_note VARCHAR(500) NULL;
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
