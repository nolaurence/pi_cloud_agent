import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "../users/user.entity";

@Entity("browser_connections")
@Index(["userId", "status"])
export class BrowserConnectionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.browserConnections, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ length: 32 })
  mode!: "sandbox-cdp" | "user-extension";

  @Column({ name: "token_ciphertext", type: "text", nullable: true })
  tokenCiphertext?: string;

  @Column({ name: "cdp_endpoint", length: 500, nullable: true })
  cdpEndpoint?: string;

  @Column({ name: "new_tab_only", default: true })
  newTabOnly!: boolean;

  @Column({ length: 32, default: "disconnected" })
  status!: "disconnected" | "connecting" | "connected" | "error";

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
