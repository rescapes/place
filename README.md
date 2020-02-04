# rescape-apollo

Apollo-backed place schema

This library runs tests against a graphql server. Thus you must add the following username and password to
server in order for tests to pass:

Run a graphql server from the rescape-region library at 127.0.0.1:8008 with a user setup with these credentials:
{username: "test", password: "testpass"}

With Django:
manage.py createsuperuser
# or echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.create_superuser('test', 'test@nowhere.man', 'testpass')" | ./manage.py shell
