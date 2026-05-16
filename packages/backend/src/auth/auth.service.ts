import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService
  ) {}

  async register(input: { email: string; displayName: string; password: string }) {
    const email = input.email.toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new ConflictException("Email is already registered");
    }
    const user = await this.users.create({
      email,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, 12)
    });
    return this.issueToken(user);
  }

  async login(emailInput: string, password: string) {
    const user = await this.users.findByEmail(emailInput.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueToken(user);
  }

  private issueToken(user: { id: string; email: string; displayName: string; role: string }) {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }
    };
  }
}
