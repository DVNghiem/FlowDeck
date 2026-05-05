---
name: django-tdd
description: Test-driven development patterns for Django covering pytest, Django TestCase, factory_boy, test client, and best practices for testing Django applications.
origin: FlowDeck
---

# Django TDD Skill

Test-driven development workflow for Django applications. Covers pytest fixtures, Django TestCase, factory_boy, and testing patterns.

## When to Activate

Activate when:
- Writing new Django features using TDD workflow
- Adding tests to existing Django applications
- Debugging test failures in Django projects
- Setting up testing infrastructure for Django apps

## TDD Workflow

1. Write a failing test (RED)
2. Run the test - it should fail
3. Write minimal implementation (GREEN)
4. Run tests - they should pass
5. Refactor (IMPROVE)
6. Verify coverage

## Test Setup

### Using pytest with Django

```python
# conftest.py
import pytest
import django
from django.conf import settings

@pytest.fixture(scope="session")
def django_db_setup():
    settings.DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }

@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()
```

### Django TestCase

```python
from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from .models import Article, Author

User = get_user_model()

class ArticleViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.author = Author.objects.create(name='Author', email='a@test.com')
        self.article = Article.objects.create(
            title='Test',
            content='Content',
            author=self.author,
            status='published'
        )
```

## Testing Views

### List View Tests

```python
def test_article_list_view(self):
    response = self.client.get(reverse('article-list'))
    self.assertEqual(response.status_code, 200)
    self.assertContains(response, 'Test')
    self.assertTemplateUsed(response, 'articles/list.html')
    self.assertEqual(len(response.context['articles']), 1)
```

### Detail View Tests

```python
def test_article_detail_view(self):
    response = self.client.get(
        reverse('article-detail', kwargs={'pk': self.article.pk})
    )
    self.assertEqual(response.status_code, 200)
    self.assertContains(response, self.article.title)

def test_article_detail_not_found(self):
    response = self.client.get(
        reverse('article-detail', kwargs={'pk': 9999})
    )
    self.assertEqual(response.status_code, 404)
```

### Authentication Tests

```python
def test_create_article_requires_login(self):
    response = self.client.get(reverse('article-create'))
    self.assertRedirects(response, '/accounts/login/?next=/articles/create/')

def test_create_article_authenticated(self):
    self.client.login(email='test@example.com', password='testpass123')
    response = self.client.post(reverse('article-create'), {
        'title': 'New Article',
        'content': 'New content',
        'status': 'draft',
    })
    self.assertEqual(response.status_code, 302)
    self.assertTrue(Article.objects.filter(title='New Article').exists())
```

### JSON API Tests

```python
def test_json_response(self):
    response = self.client.get(
        reverse('api-articles'),
        content_type='application/json'
    )
    self.assertEqual(response.status_code, 200)
    data = response.json()
    self.assertIn('articles', data)
```

## Testing Models

```python
def test_article_creation(self):
    article = Article.objects.create(
        title='Test Article',
        content='Test content',
        author=self.author,
        status='draft'
    )
    self.assertEqual(article.title, 'Test Article')
    self.assertEqual(article.status, 'draft')
    self.assertEqual(str(article), 'Test Article')

def test_article_ordering(self):
    Article.objects.create(title='Second', author=self.author)
    Article.objects.create(title='First', author=self.author)
    articles = list(Article.objects.all())
    self.assertEqual(articles[0].title, 'First')
```

## Factory Boy Fixtures

### Defining Factories

```python
# factories.py
import factory
from factory.django import DjangoModelFactory
from .models import Author, Article

class AuthorFactory(DjangoModelFactory):
    class Meta:
        model = Author

    name = factory.Sequence(lambda n: f"Author {n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.name.replace(' ', '')}@example.com")

class ArticleFactory(DjangoModelFactory):
    class Meta:
        model = Article

    title = factory.Sequence(lambda n: f"Article {n}")
    content = "Test content"
    author = factory.SubFactory(AuthorFactory)
    status = 'draft'
```

### Using Factories in Tests

```python
from .factories import AuthorFactory, ArticleFactory

def test_article_with_factory(self):
    author = AuthorFactory(name="Jane Doe")
    article = ArticleFactory(title="Test", author=author)
    assert article.author.name == "Jane Doe"
    assert article.title == "Test"
```

## Pytest Fixtures

### Basic Fixture

```python
import pytest

@pytest.fixture
def sample_data():
    return {"name": "test", "value": 42}

def test_sample_data(sample_data):
    assert sample_data["name"] == "test"
    assert sample_data["value"] == 42
```

### Fixture with Teardown

```python
import tempfile
import os

@pytest.fixture
def temp_file():
    fd, path = tempfile.mkstemp()
    os.write(fd, b"test content")
    os.close(fd)
    yield path
    os.unlink(path)

def test_temp_file(temp_file):
    assert os.path.exists(temp_file)
    with open(temp_file) as f:
        assert f.read() == "test content"
```

### Parametrized Fixtures

```python
@pytest.fixture(params=["mysql", "postgresql", "sqlite"])
def database_type(request):
    return request.param

def test_database_type(database_type):
    assert database_type in ["mysql", "postgresql", "sqlite"]
```

## Common Patterns

### Testing Forms

```python
def test_form_valid(self):
    form_data = {
        'title': 'New Article',
        'content': 'Content',
        'author': self.author.pk,
        'status': 'draft',
    }
    form = ArticleForm(data=form_data)
    self.assertTrue(form.is_valid())

def test_form_invalid(self):
    form_data = {'title': '', 'content': 'Content'}
    form = ArticleForm(data=form_data)
    self.assertFalse(form.is_valid())
    self.assertIn('title', form.errors)
```

### Testing Middleware

```python
def test_middleware_process_request(self):
    response = self.client.get('/articles/')
    self.assertEqual(response.status_code, 200)
    # Check middleware added expected headers or behavior
```

### Testing Signals

```python
def test_signal_on_save(self):
    article = ArticleFactory()
    # Verify signal handlers executed (e.g., notifications sent)
```

## Coverage Verification

```bash
# Run with coverage
pytest --cov=myapp --cov-report=html

# Minimum 80% coverage required
```

## Related Skills

- django-patterns
- python-patterns
- tdd-workflow
