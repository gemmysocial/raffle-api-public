/*Create Schema for Gemmy Tools */
CREATE SCHEMA `gemmy_tools` ;


CREATE TABLE gemmy_tools.raffledraw_info(
	raffle_time VARCHAR(255),
    raffle_id VARCHAR(255),
    raffle_type VARCHAR(255),
    raffled_project VARCHAR(255),
    selected_wallets text,
    selected_tokens text,
    uneligible_wallets text,
    PRIMARY KEY (raffle_id)
);
