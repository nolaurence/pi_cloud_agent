import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "../users/user.entity";
import { AgentMessageEntity } from "./agent-message.entity";

@Entity("agent_sessions")
@Index(["userId", "updatedAt"])
export class AgentSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.sessions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ length: 180, default: "Untitled session" })
  title!: string;

  @Column({ length: 80, nullable: true })
  provider?: string;

  @Column({ length: 160, nullable: true })
  model?: string;

  @Column({ length: 24, default: "idle" })
  status!: "idle" | "running" | "failed";

  @Column({ name: "sandbox_session_id", length: 80, nullable: true })
  sandboxSessionId?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => AgentMessageEntity, (message) => message.session)
  messages!: AgentMessageEntity[];
}
