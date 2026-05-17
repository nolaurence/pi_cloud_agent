import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "../users/user.entity";
import { ScheduledTaskRunEntity } from "./scheduled-task-run.entity";

@Entity("scheduled_tasks")
@Index(["userId", "updatedAt"])
@Index(["enabled", "nextRunAt"])
export class ScheduledTaskEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.scheduledTasks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ length: 180 })
  title!: string;

  @Column({ type: "longtext" })
  prompt!: string;

  @Column({ name: "schedule_type", length: 24 })
  scheduleType!: "daily" | "weekdays" | "weekly";

  @Column({ name: "time_of_day", length: 5 })
  timeOfDay!: string;

  @Column({ type: "json", nullable: true })
  weekdays?: number[];

  @Column({ length: 80, default: "Asia/Shanghai" })
  timezone!: string;

  @Column({ type: "tinyint", width: 1, default: true })
  enabled!: boolean;

  @Column({ length: 24, default: "idle" })
  status!: "idle" | "running" | "failed";

  @Column({ name: "last_run_at", type: "datetime", nullable: true })
  lastRunAt?: Date;

  @Column({ name: "last_run_status", length: 24, nullable: true })
  lastRunStatus?: "running" | "success" | "failed";

  @Column({ name: "next_run_at", type: "datetime", nullable: true })
  nextRunAt?: Date;

  @Column({ name: "run_count", type: "int", default: 0 })
  runCount!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => ScheduledTaskRunEntity, (run) => run.task)
  runs!: ScheduledTaskRunEntity[];
}
