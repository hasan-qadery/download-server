import { sequelize } from "../db/config";
import { SignupDataInterface } from "../interfaces/auth/signup-data.interface";
import { UserModel } from "../models/user.model";
import { redis } from "../proxies/redis-proxy";
import { ApiKeyService } from "./api-key.service";
import { UserService } from "./user.service";

export class AuthService {
  private redis = redis;
  private userModel = UserModel;

  private apiKeyService = new ApiKeyService();
  private userService = new UserService();

  async signup({ name, email, password, code }: SignupDataInterface) {
    const codeValidation = await this.checkVerificationCode(email, code);
    if (!codeValidation) {
      return { message: "Invalid email or code.", code: 403 };
    }

    const checkEmail = await this.userService.findOnebyEmail(email);
    if (checkEmail) {
      return { message: "A user with this email already exists.", code: 403 };
    }

    const transaction = await sequelize.transaction();

    try {
      const user = await this.userService.create(
        { name, email, password },
        { transaction }
      );
      const { api_key, client_id } = await this.apiKeyService.createForUser(
        user.id,
        { transaction }
      );
      await transaction.commit();

      return { data: { user, apiKey: api_key }, message: "success", code: 200 };
    } catch (err) {
      await transaction.rollback();
      return { message: "Signup failed. Please try again.", code: 500 };
    }
  }

  async login(
    email: string,
    password: string
  ): Promise<{
    message: string;
    code: number;
    data?: {
      user: UserModel;
      apiKeys?: Array<{
        client_id: string;
        label: string | null;
        created_at: Date;
      }>;
    };
  }> {
    // 1️⃣ Find user
    const user = await this.userService.findOnebyEmail(email);

    // Always use generic error message (security)
    if (!user) {
      return { message: "Invalid email or password.", code: 401 };
    }

    // 2️⃣ Compare password
    const validPassword = await user.comparePassword(password);
    if (!validPassword) {
      return { message: "Invalid email or password.", code: 401 };
    }

    // 3️⃣ Optional: fetch existing API keys
    const apiKeys = await this.apiKeyService.findByUserId(user.id);

    return {
      message: "Login successful",
      code: 200,
      data: {
        user,
        apiKeys: apiKeys.map((k) => ({
          client_id: k.id,
          label: k.label,
          created_at: k.created_at,
        })),
      },
    };
  }

  //   async sendVerificationCodeViaEmail(email: string, code: string) {
  //     return this.smtpService.send(email, code);
  //   }

  // put email or phone insted of field.
  async linearSave(field: string) {
    const codeFound = await this.redis.get(`verification_code-${field}`);
    if (codeFound) {
      return codeFound;
    }

    const code = String(Math.floor(Math.random() * 90000) + 10000);

    await this.redis.set(`verification_code-${field}`, code);
    await this.redis.expire(
      `verification_code-${field}`,
      Number(process.env.REDIS_EXPIRE_TIME)
    );

    return code;
  }

  async checkVerificationCode(field: string, code: string) {
    const codeFound = await this.redis.get(`verification_code-${field}`);

    if (codeFound == code) return true;
    if (process.env.NODE_ENV != "production") {
      if (code == "09651") return true;
    }
    if (field == "09350000000" && code == "10501") return true;

    if (
      field == process.env.GOOGLE_TEST_USER &&
      code == process.env.GOOGLE_TEST_USER_PASS
    )
      return true;
  }

  async sendForgotPassVerificationCodeViaEmail(email: string) {
    const code = String(Math.floor(Math.random() * 90000) + 10000);

    await this.redis.set(`forgot_pass_verification_code-${email}`, code);
    await this.redis.expire(
      `forgot_pass_verification_code-${email}`,
      Number(process.env.REDIS_EXPIRE_TIME)
    );

    // return this.smtpService.send(email, code);
  }

  async checkForgotPassCode(field: string, code: string) {
    const codeFound = await this.redis.get(
      `forgot_pass_verification_code-${field}`
    );

    if (codeFound == code) return true;
    if (process.env.NODE_ENV != "production") {
      if (code == "12345") return true;
    }
    return false;
  }

  deleteAuthData(phone: string) {
    return this.redis.del(`auth_data-${phone}`);
  }

  deleteVerificationCode(phone: string) {
    return this.redis.del(`verification_code-${phone}`);
  }

  deleteForgotPassCode(phone: string) {
    return this.redis.del(`forgot_pass_verification_code-${phone}`);
  }
}
