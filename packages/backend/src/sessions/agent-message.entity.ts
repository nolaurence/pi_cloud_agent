import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { AgentSessionEntity } from "./agent-session.entity";

@Entity("agent_messages")
@Index(["sessionId", "createdAt"])
export class AgentMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "session_id", type: "char", length: 36 })
  sessionId!: string;

  @ManyToOne(() => AgentSessionEntity, (session) => session.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: AgentSessionEntity;

  @Column({ length: 24 })
  role!: "user" | "assistant" | "tool" | "system";

  @Column({ type: "longtext" })
  content!: string;

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
