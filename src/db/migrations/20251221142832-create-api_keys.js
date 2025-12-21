"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("api_keys", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      secret_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      label: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      revoked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    // Index for listing keys per user efficiently
    await queryInterface.addIndex("api_keys", ["user_id"], {
      name: "api_keys_user_id_idx",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("api_keys");
  },
};
