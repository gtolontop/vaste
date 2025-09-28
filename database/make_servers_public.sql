-- Make all servers public
UPDATE game_servers SET is_public = 1;

-- Or make only your servers public (replace YOUR_USER_ID with your actual user ID)
-- UPDATE game_servers SET is_public = 1 WHERE owner_id = YOUR_USER_ID;