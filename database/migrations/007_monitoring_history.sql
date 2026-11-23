CREATE TABLE IF NOT EXISTS monitoring_history (
  kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  record_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  event_at DATETIME(3) NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (kind, record_id),
  INDEX history_time (kind, event_at)
) ENGINE=InnoDB;
