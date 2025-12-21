import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/config";
import { compare, hash } from "bcrypt";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

// Hook used for single-instance create/update/save
const hashPassword = async (user: UserModel) => {
  // changed('password') works for both create and update (and beforeSave)
  if (user.changed("password") && user.password) {
    user.password = await hash(user.password, SALT_ROUNDS);
  }
};

const beforeUpdate = async (user: UserModel, options: any) => {
  await hashPassword(user);
};

const beforeCreate = async (user: UserModel, options: any) => {
  await hashPassword(user);
};

class UserModel extends Model {
  public id!: string;

  public name!: string;
  public email!: string;
  public password!: string;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public comparePassword!: (password: string) => boolean | Promise<boolean>;
}

UserModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "users",
    createdAt: "created_at",
    updatedAt: "updated_at",
    sequelize,
  }
);

UserModel.beforeValidate(beforeCreate);
UserModel.beforeUpdate(beforeUpdate);

UserModel.prototype.comparePassword = function (password: string) {
  const hashedPassword = this.password;
  if (!hashedPassword) return false;
  return compare(password, hashedPassword);
};

export { UserModel };
