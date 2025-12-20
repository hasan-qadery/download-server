import { CreateUserInterface } from "../interfaces/create-user.interface";
import { UserModel } from "../models/user.model";
import { createApiKeyForUser } from "./api-key.service";

export class UserService {
  private userModel = UserModel;

  create(createUser: CreateUserInterface) {
    return this.userModel.create({ ...createUser });
  }

  findOne(id: string) {
    return this.userModel.findByPk(id);
  }

  findOnebyEmail(email: string) {
    return this.userModel.findOne({
      where: {
        email,
      },
    });
  }

  findAll() {
    return this.userModel.findAndCountAll();
  }

  remove(id: string) {
    return this.userModel.destroy({
      where: { id },
    });
  }

  async validateAndCreate({ name, email, password }: CreateUserInterface) {
    const checkEmail = await this.findOnebyEmail(email);
    if (checkEmail) {
      return {
        message: "A user with this email already exists.",
        code: 403,
      };
    }

    try {
      const user = await this.userModel.create({
        name,
        email,
        password,
      });

      const apiKey = await createApiKeyForUser(user.id, "apiKey", 1);

      return {
        message: "Success",
        code: 200,
        data: {
          user: user.toJSON(),
          apiKey: apiKey,
        },
      };
    } catch (err: any) {
      return {
        message: "Proccess failed",
        code: 500,
      };
    }
  }
}
