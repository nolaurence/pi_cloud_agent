import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { join } from "node:path";
import { Repository } from "typeorm";
import { UserEntity } from "./user.entity";

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  findByEmail(email: string) {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  async create(input: { email: string; displayName: string; passwordHash: string }) {
    const user = this.users.create({
      ...input,
      workspaceRoot: join("data", "users", input.email.toLowerCase().replace(/[^a-z0-9._-]/g, "_"))
    });
    return this.users.save(user);
  }
}
