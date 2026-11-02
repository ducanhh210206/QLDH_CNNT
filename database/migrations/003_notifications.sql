CREATE TABLE notification_reads (
 user_id CHAR(36) NOT NULL,
 event_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(user_id,event_key),
 FOREIGN KEY(user_id) REFERENCES users(id),
 INDEX(user_id,read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
