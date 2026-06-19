---
name: django-patterns
description: Django patterns — models, ORM, class-based views, middleware, URL routing, forms, project layout. Activate when writing or reviewing Django code.
origin: FlowDeck
---

# Django Patterns Skill

Idiomatic Django for production systems. Covers models, views, ORM patterns, and project layout.

## When to Activate

Activate when:
- Writing new Django apps or services
- Reviewing Django code for correctness and idiom
- Designing model relationships and ORM queries
- Building views with class-based views or function-based views
- Configuring URL routing and middleware

## Project Structure

### Standard Layout

```text
manage.py
mysite/
    __init__.py
    settings.py
    urls.py
    wsgi.py
myapp/
    __init__.py
    models.py
    views.py
    urls.py
    admin.py
    apps.py
```

### Decoupled Layout (Recommended)

```text
manage.py
myapp/
    __init__.py
    models.py
    views.py
    urls.py
mysite/
    __init__.py
    settings.py
    urls.py
    wsgi.py
```

Import apps as top-level modules without project prefix.

## Models and ORM

### Basic Model Definition

```python
from django.db import models

class Reporter(models.Model):
    full_name = models.CharField(max_length=70)

    def __str__(self):
        return self.full_name

class Article(models.Model):
    pub_date = models.DateField()
    headline = models.CharField(max_length=200)
    content = models.TextField()
    reporter = models.ForeignKey(Reporter, on_delete=models.CASCADE)

    def __str__(self):
        return self.headline
```

### Field Types and Options

```python
class Book(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'
        ARCHIVED = 'archived', 'Archived'

    title = models.CharField(max_length=200)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='books')
    isbn = models.CharField(max_length=13, unique=True)
    published_date = models.DateField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    tags = models.ManyToManyField('Tag', blank=True)

    class Meta:
        ordering = ['title']
        indexes = [
            models.Index(fields=['title', 'author']),
            models.Index(fields=['published_date']),
        ]
```

### QuerySet Operations

```python
# Create
author = Author.objects.create(name="Jane Doe", email="jane@example.com")
book = Book.objects.create(title="Django Mastery", author=author, isbn="9781234567890")

# Read with filtering
published_books = Book.objects.filter(status=Book.Status.PUBLISHED)
expensive_books = Book.objects.filter(price__gte=30.00)

# Complex queries with Q objects
from django.db.models import Q, F, Count, Avg
books = Book.objects.filter(
    Q(title__icontains='django') | Q(author__name__icontains='django')
).exclude(status=Book.Status.ARCHIVED)

# Aggregations
author_stats = Author.objects.annotate(
    book_count=Count('books'),
    avg_price=Avg('books__price')
).filter(book_count__gt=0)

# Update with F expressions
Book.objects.filter(pk=1).update(price=F('price') * 1.1)

# Select related (prevents N+1)
books_with_authors = Book.objects.select_related('author').all()
```

## Views

### Class-Based Views

```python
from django.http import HttpResponse
from django.views import View
from django.views.generic import ListView, DetailView, CreateView

class MyView(View):
    def get(self, request, *args, **kwargs):
        return HttpResponse("Hello, World!")

# URL routing
from django.urls import path
urlpatterns = [
    path("about/", MyView.as_view()),
]
```

### Generic Class-Based Views

```python
class ArticleListView(ListView):
    model = Article
    template_name = "articles/list.html"
    context_object_name = "articles"

    def get_queryset(self):
        return Article.objects.filter(status='published').select_related('author')

class ArticleDetailView(DetailView):
    model = Article
    template_name = "articles/detail.html"
    context_object_name = "article"

class ArticleCreateView(CreateView):
    model = Article
    fields = ['title', 'content', 'author', 'status']
    template_name = "articles/form.html"
    success_url = reverse_lazy('article-list')
```

### Function-Based Views

```python
from django.http import JsonResponse
from django.shortcuts import get_object_or_404

def article_detail(request, pk):
    article = get_object_or_404(Article, pk=pk)
    return JsonResponse({
        'id': article.id,
        'title': article.title,
        'content': article.content,
    })
```

## URL Routing

```python
from django.urls import path, include

urlpatterns = [
    path("articles/", include("articles.urls")),
    path("about/", AboutView.as_view(), name="about"),
]

# In articles/urls.py
from django.urls import path
from .views import ArticleListView, ArticleDetailView

urlpatterns = [
    path("", ArticleListView.as_view(), name="article-list"),
    path("<int:pk>/", ArticleDetailView.as_view(), name="article-detail"),
]
```

## Middleware

### Function-Based Middleware

```python
def simple_middleware(get_response):
    def middleware(request):
        # Code executed before view
        response = get_response(request)
        # Code executed after view
        return response
    return middleware
```

### Adding to Settings

```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'myapp.middleware.simple_middleware',
]
```

## Forms

### Model Forms

```python
from django import forms
from .models import Article

class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ['title', 'content', 'author', 'status']

    def clean_title(self):
        title = self.cleaned_data['title']
        if 'spam' in title.lower():
            raise forms.ValidationError("No spam allowed")
        return title
```

## Common Pitfalls

### N+1 Query Problem

```python
# Bad: causes N+1 queries
articles = Article.objects.all()
for article in articles:
    print(article.author.name)  # N additional queries

# Good: use select_related or prefetch_related
articles = Article.objects.select_related('author').all()
for article in articles:
    print(article.author.name)  # No additional queries
```

### Using Q Objects for Complex Queries

```python
from django.db.models import Q

# OR conditions
Book.objects.filter(Q(title__icontains='django') | Q(author__name__icontains='django'))

# AND with exclusion
Book.objects.filter(status='published').exclude(Q(title__icontains='old'))
```

### Bulk Operations

```python
# Create multiple objects efficiently
Book.objects.bulk_create([
    Book(title='Book 1', author=author),
    Book(title='Book 2', author=author),
])

# Update multiple objects
Book.objects.filter(status='archived').update(status='published')
```

## Related Skills

- django-tdd
- python-patterns
- api-design
