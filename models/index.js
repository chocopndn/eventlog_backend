const { sequelize } = require("../config/db");
const { DataTypes } = require("sequelize");

const Admins = require("./admins")(sequelize, DataTypes);
const Attendance = require("./attendance")(sequelize, DataTypes);
const Block = require("./block")(sequelize, DataTypes);
const Department = require("./department")(sequelize, DataTypes);
const Event = require("./event")(sequelize, DataTypes);
const Users = require("./users")(sequelize, DataTypes);
const YearLevel = require("./yearlevel")(sequelize, DataTypes);

Admins.belongsTo(Department, { foreignKey: "department_ID" });
Users.belongsTo(Department, { foreignKey: "department_ID" });
Users.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });
Users.belongsTo(Block, { foreignKey: "block_ID" });
Event.belongsTo(Department, { foreignKey: "department_ID" });
Event.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });
Event.belongsTo(Block, { foreignKey: "block_ID" });
Attendance.belongsTo(Event, { foreignKey: "event_ID" });
Attendance.belongsTo(Users, { foreignKey: "student_ID" });
Block.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });

module.exports = {
  sequelize,
  Admins,
  Attendance,
  Block,
  Department,
  Event,
  Users,
  YearLevel,
};
