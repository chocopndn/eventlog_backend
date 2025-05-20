const { pool } = require("../config/db");
const csv = require("csv-parser");
const fs = require("fs");

const updateStudents = async (filePath) => {
  const connection = await pool.getConnection();

  try {
    console.log("Starting CSV upload and update...");
    await connection.query("START TRANSACTION");

    const rows = [];
    const processedIdNumbers = new Set();

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.toLowerCase().replace(/ /g, "_"),
          })
        )
        .on("data", (row) => {
          if (row.id_number && row.id_number.trim() !== "") {
            rows.push(row);
            processedIdNumbers.add(row.id_number);
          } else {
            console.error(
              `Skipping row with missing or invalid id_number: ${JSON.stringify(
                row
              )}`
            );
          }
        })
        .on("end", () => {
          console.log(`CSV parsing finished. Total rows: ${rows.length}`);
          resolve();
        })
        .on("error", (err) => {
          console.error("Error reading CSV file:", err);
          reject(err);
        });
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const {
        id_number,
        department,
        block,
        first_name,
        middle_name,
        last_name,
        suffix,
      } = row;

      console.log(`Processing row ${i + 1} with id_number: ${id_number}`);

      const userQuery = "SELECT * FROM users WHERE id_number = ?";
      const userValues = [id_number];
      const [userResult] = await connection.query(userQuery, userValues);

      if (userResult.length > 0) {
        console.log(`User exists. Updating id_number: ${id_number}`);

        const blockQuery = `
          SELECT id FROM blocks
          WHERE name = ? AND department_id = (
            SELECT id FROM departments WHERE code = ?
          ) AND school_year_semester_id = (
            SELECT id FROM school_year_semesters WHERE status = 'Active'
          )
        `;
        const blockValues = [block, department];
        const [blockResult] = await connection.query(blockQuery, blockValues);

        let blockId;
        if (blockResult.length === 0) {
          console.warn(
            `Block not found for department: ${department}, block: ${block}. Skipping block update.`
          );
          blockId = userResult[0].block_id;
        } else {
          blockId = blockResult[0].id;
        }

        const updateQuery = `
          UPDATE users
          SET block_id = ?,
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          suffix = ?,
          status = CASE WHEN status != 'Unregistered' THEN 'Active' ELSE status END
          WHERE id_number = ?
        `;
        const updateValues = [
          blockId,
          first_name,
          middle_name || null,
          last_name,
          suffix || null,
          id_number,
        ];
        await connection.query(updateQuery, updateValues);
      } else {
        console.log(
          `User not found with id_number: ${id_number}. Inserting new user.`
        );

        const blockQuery = `
          SELECT id FROM blocks
          WHERE name = ? AND department_id = (
            SELECT id FROM departments WHERE code = ?
          ) AND school_year_semester_id = (
            SELECT id FROM school_year_semesters WHERE status = 'Active'
          )
        `;
        const blockValues = [block, department];
        const [blockResult] = await connection.query(blockQuery, blockValues);

        if (blockResult.length === 0) {
          console.error(
            `Block not found for department: ${department}, block: ${block}. Skipping user insertion.`
          );
          continue;
        }

        console.log(`Block found with id: ${blockResult[0].id}`);

        const insertQuery = `
          INSERT INTO users (id_number, block_id, first_name, middle_name, last_name, suffix, status)
          VALUES (?, ?, ?, ?, ?, ?, 'Active')
        `;
        const insertValues = [
          id_number,
          blockResult[0].id,
          first_name,
          middle_name || null,
          last_name,
          suffix || null,
        ];

        console.log(`Inserting user with values: ${insertValues}`);

        const [insertResult] = await connection.query(
          insertQuery,
          insertValues
        );
        console.log(`Inserted user with id: ${insertResult.insertId}`);
      }
    }

    const disableQuery = `
      UPDATE users
      SET status = 'Disabled'
      WHERE id_number NOT IN (?) AND status = 'Active'
    `;
    const disableValues = [Array.from(processedIdNumbers)];
    const [disableResult] = await connection.query(disableQuery, disableValues);
    console.log(
      `Disabled ${disableResult.affectedRows} users not present in the CSV file.`
    );

    await connection.query("COMMIT");
    console.log("CSV upload and student updates completed successfully.");
  } catch (error) {
    await connection.query("ROLLBACK");
    console.error(
      "Error occurred during CSV upload and student updates:",
      error
    );
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  updateStudents,
};
