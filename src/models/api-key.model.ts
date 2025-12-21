import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/config";
import { UserModel } from "./user.model";

class ApiKeyModel extends Model {
  public id!: string; // client_id
  public user_id!: string; // UUID
  public secret_hash!: string;
  public label!: string | null;
  public revoked!: boolean;
  public expires_at!: Date | null;
  public last_used_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ApiKeyModel.init(
  {
    id: {
      type: DataTypes.STRING(), // client_id
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    secret_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "api_keys",
    sequelize,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] }, // list keys per user
    ],
  }
);

UserModel.hasMany(ApiKeyModel, {
  foreignKey: "user_id",
  as: "api_keys",
});

ApiKeyModel.belongsTo(UserModel, {
  foreignKey: "user_id",
  as: "user",
});

export { ApiKeyModel };
