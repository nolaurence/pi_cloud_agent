import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { BrowserConnectionEntity } from "../browser-connections/browser-connection.entity";
import { ScheduledTaskEntity } from "../scheduled-tasks/scheduled-task.entity";
import { AgentSessionEntity } from "../sessions/agent-session.entity";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ name: "display_name", length: 120 })
  displayName!: string;

  @Column({ name: "password_hash", length: 255 })
  passwordHash!: string;

  @Column({ length: 24, default: "user" })
  role!: "user" | "admin";

  @Column({ name: "workspace_root", length: 500 })
  workspaceRoot!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => AgentSessionEntity, (session) => session.user)
  sessions!: AgentSessionEntity[];

  @OneToMany(() => BrowserConnectionEntity, (connection) => connection.user)
  browserConnections!: BrowserConnectionEntity[];

  @OneToMany(() => ScheduledTaskEntity, (task) => task.user)
  scheduledTasks!: ScheduledTaskEntity[];
}
