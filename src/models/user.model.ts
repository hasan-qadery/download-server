import { DataTypes, Model } from "sequelize";

class UserModel extends Model {
  public id!: string;

  public name!: string;
  public email!: string;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
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
      allowNull: false,
    },
  },
  {
    tableName: "users",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export { UserModel };
