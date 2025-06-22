from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="qpcr-scurve-analyzer",
    version="2.1.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="A web-based qPCR S-curve analyzer with database storage",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/qpcr-analyzer",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.11",
        "Framework :: Flask",
    ],
    python_requires=">=3.11",
    install_requires=[
        "flask==3.1.1",
        "flask-sqlalchemy==3.1.1",
        "psycopg2-binary==2.9.7",
        "numpy==1.24.3",
        "scipy==1.10.1",
        "matplotlib==3.7.1",
        "scikit-learn==1.3.0",
        "pandas==2.0.3",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "black>=22.0",
            "flake8>=4.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "qpcr-analyzer=app:main",
        ],
    },
    include_package_data=True,
    package_data={
        "": ["static/*", "*.html"],
    },
)