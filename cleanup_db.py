import psycopg2

DATABASE_URL = "postgresql://rast_db_user:PrDk1JKADX3BbbwYp7IFCcBeIaasKmoY@dpg-d73tkj6a2pns73adctag-a.frankfurt-postgres.render.com/rast_db"

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("DELETE FROM likes")
cur.execute("DELETE FROM skips")
cur.execute("DELETE FROM credit_transactions WHERE reason != 'signup'")
cur.execute("DELETE FROM uploads")

conn.commit()
cur.close()
conn.close()
print("Done — all uploads cleared.")
