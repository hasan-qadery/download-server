import { CreateOptions, Transaction } from "sequelize";
import { CreateUserInterface } from "../interfaces/create-user.interface";
import { UserModel } from "../models/user.model";

export class UserService {
  private userModel = UserModel;

  create(createUser: CreateUserInterface, options?: CreateOptions) {
    return this.userModel.create({ ...createUser }, options);
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
}
