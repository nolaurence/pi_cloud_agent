CREATE DATABASE IF NOT EXISTS `pi_cloud_agent`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `pi_cloud_agent`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `display_name` varchar(120) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(24) NOT NULL DEFAULT 'user',
  `workspace_root` varchar(500) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `title` varchar(180) NOT NULL DEFAULT 'Untitled session',
  `provider` varchar(80) DEFAULT NULL,
  `model` varchar(160) DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'idle',
  `sandbox_session_id` varchar(80) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_agent_sessions_user_updated` (`user_id`, `updated_at`),
  CONSTRAINT `fk_agent_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_messages` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `role` varchar(24) NOT NULL,
  `content` longtext NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_agent_messages_session_created` (`session_id`, `created_at`),
  CONSTRAINT `fk_agent_messages_session` FOREIGN KEY (`session_id`) REFERENCES `agent_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `browser_connections` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `mode` varchar(32) NOT NULL,
  `token_ciphertext` text DEFAULT NULL,
  `cdp_endpoint` varchar(500) DEFAULT NULL,
  `new_tab_only` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(32) NOT NULL DEFAULT 'disconnected',
  `last_error` text DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_browser_connections_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_browser_connections_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `title` varchar(180) NOT NULL,
  `prompt` longtext NOT NULL,
  `schedule_type` varchar(24) NOT NULL,
  `time_of_day` varchar(5) NOT NULL,
  `weekdays` json DEFAULT NULL,
  `timezone` varchar(80) NOT NULL DEFAULT 'Asia/Shanghai',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(24) NOT NULL DEFAULT 'idle',
  `last_run_at` datetime DEFAULT NULL,
  `last_run_status` varchar(24) DEFAULT NULL,
  `next_run_at` datetime DEFAULT NULL,
  `run_count` int NOT NULL DEFAULT 0,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_tasks_user_updated` (`user_id`, `updated_at`),
  KEY `idx_scheduled_tasks_due` (`enabled`, `next_run_at`),
  CONSTRAINT `fk_scheduled_tasks_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `scheduled_task_runs` (
  `id` char(36) NOT NULL,
  `task_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `trigger` varchar(24) NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'running',
  `session_id` char(36) DEFAULT NULL,
  `output` longtext DEFAULT NULL,
  `error` longtext DEFAULT NULL,
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_task_runs_user_created` (`user_id`, `created_at`),
  KEY `idx_scheduled_task_runs_task_created` (`task_id`, `created_at`),
  CONSTRAINT `fk_scheduled_task_runs_task` FOREIGN KEY (`task_id`) REFERENCES `scheduled_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scheduled_task_runs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
