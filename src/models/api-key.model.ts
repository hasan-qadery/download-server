// src/models/ApiKey.ts
import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db/config";
import { UserModel } from "./user.model";

class ApiKeyModel extends Model {
  public id!: number;
  public user_id!: string;
  public key_hash!: string;
  public label!: string | null;
  public expires_at?: Date | null;
  public created_at!: Date;
  public updated_at!: Date;
  //   public last_used_at?: Date | null;
}

ApiKeyModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    keyHash: {
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
    // last_used_at: {
    //   type: DataTypes.DATE,
    //   allowNull: true,
    // },
  },
  {
    tableName: "api_keys",
    sequelize,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["keyHash"] }, // fast lookup
      { fields: ["userId"] },
    ],
  }
);

UserModel.hasMany(ApiKeyModel, {
  foreignKey: "user_id",
  as: "api_keys",
  onDelete: "CASCADE",
});
ApiKeyModel.belongsTo(UserModel, { foreignKey: "user_id", as: "user" });

export { ApiKeyModel };
