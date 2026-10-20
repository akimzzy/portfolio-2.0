---
title: "Importing a product catalogue from a spreadsheet"
summary: "Design a catalogue import that validates rows, explains errors, stages changes, and commits against current database state."
slug: "spreadsheet-product-imports"
author: "Akeem Adeyemi"
topics: ["imports", "e-commerce", "postgresql", "validation"]
date: "2026-10-19"
draft: false
---

# Importing a product catalogue from a spreadsheet

A spreadsheet can contain a perfectly readable product name and still be unsuitable for import. Its price might use the wrong format, two rows might reuse a barcode, or the same product might appear with inconsistent descriptions.

Consider importing two sizes of an amber perfume and a new citrus fragrance. The admin needs to see errors and review the proposed additions before any product becomes visible in the store.

The workflow I built separates file parsing, validation, a saved preview, and a final database commit. This walkthrough focuses on adding new products safely. Updating existing products is a separate workflow.

## Give the file a clear contract

The store's template includes product name, variant, price in NGN, opening stock, category, brand, description, SKU, and barcode. Here, SKU is the store’s identifying code for a sellable variant, such as the 50 ml bottle.

Here are the fields relevant to the example; the actual template also requires the other headings listed above:

| Product name | Variant | Price (NGN) | Opening stock | Barcode |
| --- | --- | ---: | ---: | --- |
| Amber perfume | 100ml | 15000.00 | 4 | 001234567890 |
| Amber perfume | 50ml | 9000.00 | 6 | 001234567891 |
| Citrus perfume | 100ml | fifteen thousand | -2 | 001234567890 |

The third row has an invalid price and negative stock. Once those are corrected, its barcode also conflicts with the first row. The current parser checks relationships among rows that passed field validation, so it may reveal these errors across more than one correction pass.

For this example, use Perfume as the category and Example Brand as the brand. Give the two amber variants the same product description. Supply unique SKU codes or leave them blank for the importer to generate.

Keep identifiers as text where their representation matters. A spreadsheet can remove leading zeroes from a numeric barcode before the importer ever sees it. The template and instructions should tell the admin to use text-formatted identifier cells.

## Parse first, then validate meaning

CSV parsing needs to handle quoting and escaped values correctly. Splitting each line on a comma breaks as soon as a description contains a comma. Use a maintained parser and bound the bytes, rows, and columns it can accept. The [CSV Parse options](https://csv.js.org/parse/options/) illustrate the controls a library can expose; importing a parser does not configure those limits for you.

XLSX is a compressed workbook, so upload size alone is not enough to bound the work. The parser in this project checks the expanded content before processing the workbook and rejects unsupported features such as macros and external links. It also checks for the expected template headings.

Parsing produces candidate rows. Validation then checks whether those rows fit the catalogue's rules: required names, supported prices, non-negative whole-number stock, bounded text, and permitted variant counts.

Formula cells need an explicit policy. Do not silently execute workbook formulas or treat an arbitrary cached formula result as trusted input. A template intended for plain data should require those values as data.

## Preserve the row number in every error

The admin needs to correct a spreadsheet, not interpret a database exception.

An issue should identify the source row, field, and action needed. For the example above, useful messages would be:

- Row 4, Price (NGN): enter a numeric price with at most two decimal places.
- Row 4, Opening stock: enter a non-negative whole number.

After the price and stock are fixed, a further check can report: “Row 4, Barcode: this barcode is used by another row in the file.”

The displayed row includes the header row, so the third data row is row 4. Preserve that number through parsing, validation, and preview. Re-numbering after filtering out blank rows can send the admin to the wrong place.

Syntax errors need their own messages too. An unmatched CSV quote is a file-reading problem, not a missing product-name problem.

## Check relationships across rows

Some errors only appear when rows are considered together. Two individually valid rows can still represent the same variant twice.

In this application, rows are grouped using normalised product name, brand, and category. Variant names must be distinct within each group. Shared product information, such as description, must agree across the group's rows.

Normalisation trims and collapses whitespace and compares the relevant identity fields consistently. It should not rewrite every field indiscriminately: normalising an identity for comparison is different from changing the display name the business chose.

SKUs and barcodes also need duplicate checks across the file and against the current catalogue. A file-only `Set` cannot detect a code that another admin has just added to the database.

## Stage the result before applying it

**Staging** means saving proposed rows outside the live catalogue. The application stores an import record and chunks of proposed data, then builds a preview summarising additions, skips, and errors. For this example, the admin must fix the citrus row before committing the import. Saving a chunk does not make those products public.

An import belongs to an authorised admin and has an expiry. The commit path checks ownership and permissions again. A preview ID is not permission to modify the catalogue.

This importer adds new products; it does not update existing prices or stock. Matching existing groups can be skipped, while conflicting identities need attention. Show those outcomes beside the counts so an admin does not mistake a skipped product for an updated one. Opening stock is applied to new records, not reapplied whenever an existing product appears in a file.

## Recheck at commit time

A preview describes the catalogue when it was checked. Another admin may create a matching product before commit.

The current implementation starts a database transaction, locks the import record, checks expiry and readiness, and coordinates the commit against catalogue writes. It validates the staged data on the server rather than trusting a browser preview, then reinspects it before inserting products, variants, opening-stock movements, and audit records.

That coordination matters because the name-based duplicate rule is not enforced by one database uniqueness constraint. The code uses table-level coordination for this commit. For example, a matching amber product added after preview may now be skipped; a conflicting barcode can instead stop the commit. Report the actual commit counts and conflicts, rather than treating the preview as a promise. Those locks can temporarily delay ordinary catalogue writes, so keep imports bounded and measure the commit duration. A high-volume importer may need a different coordination design.

After a successful commit, the import records that it is committed and retains the result. Repeating the same commit returns that outcome rather than creating the catalogue again.

## Chunking and atomicity are separate decisions

**Atomicity** means the final catalogue changes succeed together or none of them take effect. Uploading or inserting rows in chunks does not by itself determine that boundary.

In this implementation, staged chunks are inspected and inserted within the final commit transaction. Multiple insert statements can still belong to that one transaction. A failed commit rolls back its live catalogue changes, while the staged import may remain available for rechecking or retry until it expires. Fixing the file can require another upload; this is not an in-place spreadsheet editor.

Larger workloads may need a different design, but then partial progress and recovery need to be explicit. Do not describe a batch-by-batch live import as all-or-nothing unless the implementation actually provides that guarantee.

## Verify what the admin sees and what the database receives

Use a valid file, an invalid price, repeated variants, duplicate barcodes, inconsistent descriptions, an oversized workbook, and a malformed CSV. Check that errors point to the right rows.

In a fresh test catalogue, correct the citrus row to price `12000.00`, stock `2`, and barcode `001234567892`. With the shared product fields filled as described above, expect two products, three variants, and opening stock totalling 12 units across those variants.

Then add a matching product or conflicting barcode after preview and attempt a commit. Repeat a successful commit: no additional products or opening stock should appear. Force a failure during the final transaction and confirm that no partial live catalogue or stock movements remain. These are integration checks to run against the importer, not results demonstrated by this article alone.

The importer should make the outcome understandable: which data was rejected, which was skipped, what was committed, and what the admin can safely do next. That is what turns a spreadsheet upload into a usable catalogue workflow.
