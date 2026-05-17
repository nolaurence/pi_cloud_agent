import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ScheduledTaskEntity } from "./scheduled-task.entity";

@Entity("scheduled_task_runs")
@Index(["userId", "createdAt"])
@Index(["taskId", "createdAt"])
export class ScheduledTaskRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "task_id", type: "char", length: 36 })
  taskId!: string;

  @ManyToOne(() => ScheduledTaskEntity, (task) => task.runs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task!: ScheduledTaskEntity;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @Column({ length: 24 })
  trigger!: "scheduled" | "manual";

  @Column({ length: 24, default: "running" })
  status!: "running" | "success" | "failed";

  @Column({ name: "session_id", type: "char", length: 36, nullable: true })
  sessionId?: string;

  @Column({ type: "longtext", nullable: true })
  output?: string;

  @Column({ type: "longtext", nullable: true })
  error?: string;

  @Column({ name: "started_at", type: "datetime" })
  startedAt!: Date;

  @Column({ name: "finished_at", type: "datetime", nullable: true })
  finishedAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
